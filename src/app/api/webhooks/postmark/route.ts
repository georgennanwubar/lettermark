/**
 * /api/webhooks/postmark — Postmark message stream webhooks.
 *
 * Postmark sends one event per request. Types:
 *   Bounce: { Type: "HardBounce" | "SoftBounce" | "Transient", ... }
 *   SpamComplaint: { ... }
 */
import { NextRequest, NextResponse } from "next/server";
import { recordBounce, recordComplaint } from "@/lib/email/webhook-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const e = await req.json();
  const email = String(e?.Email ?? e?.Recipient ?? "");
  if (!email) return NextResponse.json({ ok: true });

  const recordType = String(e?.RecordType ?? "");
  const bounceType = String(e?.Type ?? "");

  if (recordType === "Bounce") {
    const hard = bounceType === "HardBounce" || bounceType === "BadEmailAddress";
    await recordBounce({ email, hard, reason: String(e?.Description ?? "") });
  } else if (recordType === "SpamComplaint") {
    await recordComplaint({ email });
  }
  return NextResponse.json({ ok: true });
}
