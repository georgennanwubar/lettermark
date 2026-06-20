/**
 * campaigns/[id]/edit/page.tsx — Server entry to the block editor.
 * Loads campaign content + hydrates the client editor.
 */
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { getCampaign, listLists } from "@/server/queries";
import { emptyDocument, type EmailDocument } from "@/lib/email/blocks";
import { CampaignEditor } from "@/components/editor/campaign-editor";

export const metadata = { title: "Edit campaign" };
export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }

export default async function CampaignEditPage({ params }: PageProps) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const { account } = await requireAuth();
  const [c, allLists] = await Promise.all([
    getCampaign(account.id, id),
    listLists(account.id),
  ]);
  if (!c) notFound();

  const doc = (c.contentJson as EmailDocument | null) ?? emptyDocument();

  return (
    <CampaignEditor
      campaign={{
        id: c.id,
        subject: c.subject,
        preheader: c.preheader ?? "",
        fromName: c.fromName ?? "",
        fromEmail: c.fromEmail ?? "",
        replyTo: c.replyTo ?? "",
        audience: c.audience ?? null,
      }}
      initialDocument={doc}
      lists={allLists}
    />
  );
}
