/**
 * /api/track/open — Open-tracking pixel.
 *
 * Returns a transparent 1x1 GIF and inserts an `action_opens` row.
 * URL params: c=campaignId, s=subscriberHash, t=signature (HMAC of "c:s").
 *
 * No-cache headers ensure repeat opens are recorded. We do NOT short-circuit
 * on duplicate opens here — analytics distinguishes unique vs total downstream.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { actionOpens, campaigns, subscribers } from "@/lib/db/schema";
import { verifyTracking } from "@/lib/email/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64",
);

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const c = Number(p.get("c"));
  const hash = p.get("s");
  const sig = p.get("t");
  if (!Number.isFinite(c) || !hash || !sig) return pixel();
  if (!verifyTracking(`${c}:${hash}`, sig)) return pixel();

  try {
    const sub = await db.query.subscribers.findFirst({
      where: eq(subscribers.hash, hash),
      columns: { id: true, country: true },
    });
    if (!sub) return pixel();

    const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    await db.insert(actionOpens).values({
      campaignId: c,
      subscriberId: sub.id,
      ipAddress: ip,
      userAgent: ua,
      country: sub.country ?? null,
    });

    await db
      .update(campaigns)
      .set({ openCount: sql`${campaigns.openCount} + 1` })
      .where(eq(campaigns.id, c));
  } catch (err) {
    console.error("open track error", err);
  }

  return pixel();
}

function pixel() {
  return new NextResponse(new Uint8Array(PIXEL), {
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache",
    },
  });
}
