/**
 * /api/cron/automations — Periodically advance automation workflow runs.
 * Same auth scheme as /api/cron/drain.
 */
import { NextRequest, NextResponse } from "next/server";
import { advanceDueRuns } from "@/lib/automation/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await advanceDueRuns({ limit: 200 });
    return NextResponse.json({ ok: true, ...r });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
