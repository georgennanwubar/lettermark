/**
 * campaigns/[id]/page.tsx — Campaign overview + analytics + send action.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { getCampaignAnalytics } from "@/server/queries";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Separator,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CampaignStatusBadge } from "@/components/dashboard/campaign-status-badge";
import { formatNumber, formatPercent, formatDate } from "@/lib/utils/cn";
import { Send, Pencil, Eye, MousePointerClick, AlertTriangle, UserMinus, Trash2, BarChart3 } from "lucide-react";
import { sendCampaign, deleteCampaign } from "../actions";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }

export default async function CampaignDetailPage({ params }: PageProps) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const { account } = await requireAuth();
  const data = await getCampaignAnalytics(account.id, id);
  if (!data) notFound();

  const { campaign: c, sent, opens, uniqueOpens, clicks, uniqueClicks, bounces, unsubs, pending } = data;
  const denom = sent || 1;

  const canSend = c.status === "draft" || c.status === "scheduled";

  return (
    <>
      <PageHeader
        title={c.subject || "(untitled)"}
        description={c.preheader ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <CampaignStatusBadge status={c.status} />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/campaigns/${c.id}/edit`}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Link>
            </Button>
            {canSend && (
              <form action={sendCampaign}>
                <input type="hidden" name="id" value={c.id} />
                <Button type="submit" size="sm">
                  <Send className="mr-1 h-3.5 w-3.5" />Send now
                </Button>
              </form>
            )}
          </div>
        }
      />
      <PageBody>
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <Stat label="Recipients" value={formatNumber(c.totalRecipients)} />
          <Stat label="Delivered" value={formatNumber(sent)} hint={pending ? `${formatNumber(pending)} pending` : undefined} />
          <Stat label="Opens" value={formatNumber(opens)} hint={`${formatPercent(uniqueOpens / denom)} unique`} icon={Eye} />
          <Stat label="Clicks" value={formatNumber(clicks)} hint={`${formatPercent(uniqueClicks / denom)} unique`} icon={MousePointerClick} />
          <Stat label="Bounces" value={formatNumber(bounces)} hint={formatPercent(bounces / denom)} icon={AlertTriangle} />
          <Stat label="Unsubscribed" value={formatNumber(unsubs)} hint={formatPercent(unsubs / denom)} icon={UserMinus} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" />Engagement</CardTitle>
              <CardDescription>How recipients are interacting</CardDescription>
            </CardHeader>
            <CardContent>
              <EngagementBar label="Open rate" value={uniqueOpens / denom} color="bg-emerald-500" />
              <EngagementBar label="Click rate" value={uniqueClicks / denom} color="bg-sky-500" />
              <EngagementBar label="Click-to-open" value={uniqueOpens ? uniqueClicks / uniqueOpens : 0} color="bg-violet-500" />
              <EngagementBar label="Bounce rate" value={bounces / denom} color="bg-amber-500" />
              <EngagementBar label="Unsubscribe rate" value={unsubs / denom} color="bg-red-500" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <KV label="Status"><CampaignStatusBadge status={c.status} /></KV>
              <KV label="Type"><Badge variant="outline" className="capitalize">{c.type}</Badge></KV>
              <KV label="From">{c.fromName ? `${c.fromName} <${c.fromEmail}>` : c.fromEmail || "—"}</KV>
              <KV label="Reply-to">{c.replyTo || "—"}</KV>
              <Separator />
              <KV label="Created">{formatDate(c.createdAt)}</KV>
              {c.scheduledFor && <KV label="Scheduled">{formatDate(c.scheduledFor)}</KV>}
              {c.sentAt && <KV label="Sent">{formatDate(c.sentAt)}</KV>}
              <KV label="Open tracking">{c.trackOpens ? "Enabled" : "Disabled"}</KV>
              <KV label="Click tracking">{c.trackClicks ? "Enabled" : "Disabled"}</KV>

              <Separator />
              <form action={deleteCampaign}>
                <input type="hidden" name="id" value={c.id} />
                <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="mr-1 h-3.5 w-3.5" />Delete campaign
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>What recipients will see</CardDescription>
          </CardHeader>
          <CardContent>
            {c.contentHtml ? (
              <iframe
                title="Campaign preview"
                srcDoc={c.contentHtml}
                className="h-[600px] w-full rounded-md border border-border bg-white"
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Content hasn&apos;t been designed yet.{" "}
                <Link href={`/campaigns/${c.id}/edit`} className="text-primary hover:underline">Open the editor</Link>.
              </div>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

function Stat({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon?: React.ElementType }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
          <span>{label}</span>
          {Icon && <Icon className="h-3.5 w-3.5" />}
        </div>
        <div className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function EngagementBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="mb-3 space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{formatPercent(value)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
