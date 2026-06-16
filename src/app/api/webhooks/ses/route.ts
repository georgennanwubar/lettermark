/**
 * /api/webhooks/ses — Amazon SES via SNS.
 *
 * The endpoint receives SNS messages. We support:
 *   SubscriptionConfirmation — auto-confirm by GETting SubscribeURL
 *   Notification with Message JSON containing notificationType: Bounce|Complaint
 */
import { NextRequest, NextResponse } from "next/server";
import { recordBounce, recordComplaint } from "@/lib/email/webhook-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // SNS sets a header indicating message type
  const messageType = req.headers.get("x-amz-sns-message-type") ?? "";
  const body = await req.json();

  if (messageType === "SubscriptionConfirmation" && body.SubscribeURL) {
    try {
      await fetch(body.SubscribeURL);
    } catch (err) {
      console.error("SNS subscribe confirm failed", err);
    }
    return NextResponse.json({ ok: true });
  }

  if (messageType !== "Notification") return NextResponse.json({ ok: true });

  let payload: any;
  try {
    payload = JSON.parse(body.Message);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const notif = String(payload?.notificationType ?? payload?.eventType ?? "");
  if (notif === "Bounce") {
    const hard = String(payload?.bounce?.bounceType ?? "") === "Permanent";
    const reason = String(payload?.bounce?.bouncedRecipients?.[0]?.diagnosticCode ?? "");
    for (const r of payload?.bounce?.bouncedRecipients ?? []) {
      await recordBounce({ email: String(r.emailAddress), hard, reason });
    }
  } else if (notif === "Complaint") {
    for (const r of payload?.complaint?.complainedRecipients ?? []) {
      await recordComplaint({ email: String(r.emailAddress) });
    }
  }
  return NextResponse.json({ ok: true });
}
