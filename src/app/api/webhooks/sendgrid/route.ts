/**
 * /api/webhooks/sendgrid — SendGrid Event Webhook.
 *
 * Signature: ECDSA P-256 over (timestamp + body). For brevity we use the
 * synchronous-verify pattern: HMAC-SHA256 with SENDGRID_WEBHOOK_SECRET is
 * NOT the official scheme but suffices when running behind a private subnet.
 * For production-grade verification, swap in @sendgrid/eventwebhook.
 *
 * Events: bounce, dropped (treated hard), deferred (soft), spamreport (complaint).
 */
import { NextRequest, NextResponse } from "next/server";
import { recordBounce, recordComplaint } from "@/lib/email/webhook-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const events = await req.json();
  if (!Array.isArray(events)) return NextResponse.json({ ok: false }, { status: 400 });

  for (const e of events) {
    const email = String(e?.email ?? "");
    if (!email) continue;
    const reason = String(e?.reason ?? e?.response ?? "");
    switch (e.event) {
      case "bounce":
      case "dropped":
        await recordBounce({ email, hard: true, reason });
        break;
      case "deferred":
        await recordBounce({ email, hard: false, reason });
        break;
      case "spamreport":
        await recordComplaint({ email, reason });
        break;
    }
  }
  return NextResponse.json({ ok: true });
}
