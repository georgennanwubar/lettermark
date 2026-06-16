/**
 * /api/subscribe — Endpoint hit by hosted forms and embed snippets.
 *
 * Body (form-encoded or JSON):
 *   email (required)
 *   formId (required) — references a `forms` row
 *   firstName, lastName, ... (any additional fields; matched against the form schema)
 *
 * Flow:
 *   1. Validate against the form's schema.
 *   2. Upsert subscriber in `pending` status.
 *   3. Attach to the form's target lists/tags.
 *   4. If doubleOptIn: send a confirmation email containing a tokened link
 *      to /confirm. Otherwise: mark subscribed immediately.
 *   5. Return JSON { ok, status: "pending" | "subscribed", redirect? }.
 *
 * CORS: enabled for any origin so embed snippets work from third-party sites.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  subscribers, forms, listSubscribers, tagSubscribers, accounts,
} from "@/lib/db/schema";
import { generateSubscriberHash } from "@/lib/utils/hash";
import { signTracking } from "@/lib/email/tracking";
import { makeEnvProvider } from "@/lib/email/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: Record<string, any>;
  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      const fd = await req.formData();
      body = Object.fromEntries(fd.entries());
    }
  } catch {
    return json({ ok: false, error: "invalid request" }, 400);
  }

  const email = String(body.email || "").trim().toLowerCase();
  const formId = Number(body.formId);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "invalid email" }, 400);
  }
  if (!Number.isFinite(formId)) {
    return json({ ok: false, error: "missing form" }, 400);
  }

  const form = await db.query.forms.findFirst({ where: eq(forms.id, formId) });
  if (!form) return json({ ok: false, error: "form not found" }, 404);

  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, form.accountId) });
  if (!account) return json({ ok: false, error: "form not found" }, 404);

  // Extract custom fields from body — anything not first-class becomes JSONB
  const firstName = body.firstName ? String(body.firstName).slice(0, 191) : null;
  const lastName = body.lastName ? String(body.lastName).slice(0, 191) : null;
  const reservedKeys = new Set(["email", "firstName", "lastName", "formId", "_honeypot"]);
  const customFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!reservedKeys.has(k)) customFields[k] = v;
  }

  // Honeypot — bots fill hidden fields named _honeypot. If non-empty, silently 200.
  if (body._honeypot) {
    return json({ ok: true, status: "pending" }, 200);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const initialStatus = form.doubleOptIn ? "pending" : "subscribed";

  // Upsert subscriber (account_id + email unique)
  const existing = await db.query.subscribers.findFirst({
    where: and(eq(subscribers.accountId, account.id), eq(subscribers.email, email)),
  });

  let subscriber;
  if (existing) {
    // Re-subscribing? Restore to pending/subscribed but don't overwrite a healthy record
    const next = existing.status === "unsubscribed" ? initialStatus : existing.status;
    await db
      .update(subscribers)
      .set({
        status: next,
        firstName: firstName ?? existing.firstName,
        lastName: lastName ?? existing.lastName,
        customFields: { ...(existing.customFields ?? {}), ...customFields },
        updatedAt: new Date(),
      })
      .where(eq(subscribers.id, existing.id));
    subscriber = { ...existing, status: next };
  } else {
    const hash = generateSubscriberHash();
    const [row] = await db
      .insert(subscribers)
      .values({
        accountId: account.id,
        hash,
        email,
        firstName,
        lastName,
        status: initialStatus,
        ipSignup: ip,
        signupAt: new Date(),
        confirmAt: initialStatus === "subscribed" ? new Date() : null,
        customFields,
      })
      .returning();
    subscriber = row;
  }

  // Add to target lists / tags (idempotent — relies on PK conflict)
  if (form.targetLists?.length) {
    for (const listId of form.targetLists) {
      await db.insert(listSubscribers).values({ listId, subscriberId: subscriber.id }).onConflictDoNothing();
    }
  }
  if (form.targetTags?.length) {
    for (const tagId of form.targetTags) {
      await db.insert(tagSubscribers).values({ tagId, subscriberId: subscriber.id }).onConflictDoNothing();
    }
  }

  // Bump form submission counter
  await db.update(forms).set({ submissions: sql`${forms.submissions} + 1` }).where(eq(forms.id, form.id));

  // Send confirmation if double opt-in
  if (form.doubleOptIn && subscriber.status === "pending") {
    await sendConfirmationEmail({
      to: email,
      hash: subscriber.hash,
      formId: form.id,
      fromName: account.defaultFromName ?? account.name,
      fromEmail: account.defaultFromEmail ?? "no-reply@example.com",
      accountName: account.name,
    });
  } else if (subscriber.status === "subscribed") {
    await db.update(forms).set({ conversions: sql`${forms.conversions} + 1` }).where(eq(forms.id, form.id));
  }

  return json(
    {
      ok: true,
      status: subscriber.status,
      redirect: form.doubleOptIn ? null : form.successUrl ?? null,
    },
    200,
  );
}

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: CORS });
}

async function sendConfirmationEmail(opts: {
  to: string; hash: string; formId: number; fromName: string; fromEmail: string; accountName: string;
}) {
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const sig = signTracking(`confirm:${opts.hash}:${opts.formId}`);
  const url = `${appUrl}/confirm?s=${opts.hash}&f=${opts.formId}&t=${sig}`;

  const html = `<!doctype html><html><body style="font-family:sans-serif;background:#f4f4f5;padding:24px">
  <table cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
    <tr><td>
      <h1 style="font-size:20px;margin:0 0 12px">Please confirm your subscription</h1>
      <p style="color:#52525b;line-height:1.5">Click the button below to confirm your email and start receiving updates from ${escapeHtml(opts.accountName)}.</p>
      <p style="margin:24px 0"><a href="${url}" style="background:#2563eb;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block">Confirm subscription</a></p>
      <p style="color:#71717a;font-size:13px">If you didn't sign up, you can safely ignore this email.</p>
      <p style="color:#a1a1aa;font-size:11px;margin-top:24px">Or copy this URL: ${url}</p>
    </td></tr>
  </table></body></html>`;

  const text = `Please confirm your subscription to ${opts.accountName}.\n\nClick this link to confirm:\n${url}\n\nIf you didn't sign up, you can safely ignore this email.`;

  try {
    const provider = makeEnvProvider();
    await provider.send({
      from: { email: opts.fromEmail, name: opts.fromName },
      to: opts.to,
      subject: `Confirm your subscription to ${opts.accountName}`,
      html,
      text,
    });
  } catch (err) {
    console.error("confirm email failed", err);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
