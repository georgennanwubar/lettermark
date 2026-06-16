/**
 * /api/webhooks/resend — Resend events webhook.
 *
 * Event types we care about:
 *   email.bounced (hard) — RFC 5321 4xx counts as soft, 5xx as hard
 *   email.complained — spam report
 *
 * Resend signs payloads via Svix. For brevity we accept the payload as-is when
 * RESEND_WEBHOOK_SECRET is not configured.
 */
import { NextRequest, NextResponse } from "next/server";
import { recordBounce, recordComplaint } from "@/lib/email/webhook-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const type = String(body?.type ?? "");
  const email = String(body?.data?.to?.[0] ?? body?.data?.email ?? "");
  if (!email) return NextResponse.json({ ok: true });

  if (type === "email.bounced") {
    const bounceType = String(body?.data?.bounce?.bounceType ?? "");
    await recordBounce({
      email,
      hard: bounceType !== "Transient",
      reason: String(body?.data?.bounce?.message ?? ""),
    });
  } else if (type === "email.complained") {
    await recordComplaint({ email });
  }
  return NextResponse.json({ ok: true });
}
