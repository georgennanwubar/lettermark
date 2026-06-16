/**
 * /api/webhooks/mailgun — Mailgun events webhook.
 *
 * Verifies HMAC-signed payloads using MAILGUN_WEBHOOK_SIGNING_KEY, then
 * routes events: permanent_fail / hard_bounce -> recordBounce(hard=true),
 * temporary_fail -> recordBounce(hard=false), complained -> recordComplaint.
 *
 * Docs: https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/#webhooks
 */
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { recordBounce, recordComplaint } from "@/lib/email/webhook-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verify(signature: { timestamp: string; token: string; signature: string }, key: string): boolean {
  const expected = createHmac("sha256", key)
    .update(signature.timestamp + signature.token)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature.signature));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "not configured" }, { status: 500 });

  const body = await req.json();
  if (!verify(body.signature, key)) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  const e = body["event-data"];
  const email: string = e?.recipient ?? "";
  const eventType: string = e?.event ?? "";
  const severity: string = e?.severity ?? "";
  const reason: string = e?.["delivery-status"]?.message ?? e?.reason ?? "";

  if (!email) return NextResponse.json({ ok: true });

  if (eventType === "failed") {
    await recordBounce({ email, hard: severity === "permanent", reason });
  } else if (eventType === "complained") {
    await recordComplaint({ email, reason });
  }

  return NextResponse.json({ ok: true });
}
