/**
 * /archive/[campaignId] — Web version of a campaign.
 *
 * Public, but only accessible if the campaign has been sent (or scheduled).
 * Renders the pre-baked contentHtml in a sandboxed iframe.
 */
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ campaignId: string }> }

export default async function ArchivePage({ params }: PageProps) {
  const { campaignId: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const c = await db.query.campaigns.findFirst({ where: eq(campaigns.id, id) });
  if (!c) notFound();
  if (c.status === "draft") notFound(); // don't expose drafts

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-3xl p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{c.fromName ? `${c.fromName} • ` : ""}{c.subject}</span>
          {c.sentAt && <time dateTime={c.sentAt.toISOString()}>{c.sentAt.toLocaleDateString()}</time>}
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
          <iframe
            title={c.subject}
            srcDoc={c.contentHtml ?? "<p style='padding:24px;font-family:sans-serif'>This newsletter has no content.</p>"}
            sandbox="allow-same-origin allow-popups"
            className="h-[80vh] w-full"
          />
        </div>
      </div>
    </div>
  );
}
