/**
 * /api/track/click — Click-tracking redirector.
 *
 * Params: c=campaignId, s=subscriberHash, l=linkId, t=signature.
 * Signature = HMAC of "c:s:l". Logs the click and 302s to the link's real URL.
 *
 * Falls back to a sensible URL if anything is invalid so we never leave the
 * user staring at a broken redirect.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { actionClicks, campaigns, subscribers, links } from "@/lib/db/schema";
import { verifyTracking } from "@/lib/email/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK = process.env.APP_URL ?? "/";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const c = Number(p.get("c"));
  const hash = p.get("s");
  const l = Number(p.get("l"));
  const sig = p.get("t");

  if (!Number.isFinite(c) || !hash || !Number.isFinite(l) || !sig) {
    return NextResponse.redirect(FALLBACK, 302);
  }
  if (!verifyTracking(`${c}:${hash}:${l}`, sig)) {
    return NextResponse.redirect(FALLBACK, 302);
  }

  // Find the destination — links table contains the real URL
  const link = await db.query.links.findFirst({
    where: eq(links.id, l),
    columns: { url: true, campaignId: true },
  });
  // Safety: link must belong to the campaign in the URL
  if (!link || link.campaignId !== c) {
    return NextResponse.redirect(FALLBACK, 302);
  }

  // Log click (best-effort — don't block redirect)
  try {
    const sub = await db.query.subscribers.findFirst({
      where: eq(subscribers.hash, hash),
      columns: { id: true, country: true },
    });
    if (sub) {
      const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

      await Promise.all([
        db.insert(actionClicks).values({
          campaignId: c,
          subscriberId: sub.id,
          linkId: l,
          ipAddress: ip,
          userAgent: ua,
          country: sub.country ?? null,
        }),
        db.update(campaigns)
          .set({ clickCount: sql`${campaigns.clickCount} + 1` })
          .where(eq(campaigns.id, c)),
        db.update(links)
          .set({ clickCount: sql`${links.clickCount} + 1` })
          .where(eq(links.id, l)),
      ]);
    }
  } catch (err) {
    console.error("click track error", err);
  }

  return NextResponse.redirect(link.url, 302);
}
