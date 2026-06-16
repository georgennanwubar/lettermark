/**
 * /api/cron/drain — Invoked on a schedule (Vercel cron, GitHub Actions, etc.)
 * to drain pending queue rows. Protected by CRON_SECRET.
 *
 * For higher-throughput deployments, run the long-running worker
 * (`pnpm queue:worker`) instead — this endpoint is for serverless-only setups.
 */
import { NextRequest, NextResponse } from "next/server";
import { drainOnce } from "@/lib/queue/sender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: allow when not configured
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await drainOnce({ batchSize: 100 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("drain error", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "drain failed" }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
