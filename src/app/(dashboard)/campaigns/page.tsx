/**
 * campaigns/page.tsx — Index of all campaigns.
 *
 * Server-rendered table with status badges and engagement metrics. The
 * "Create campaign" CTA on this page is the primary entry point for sends.
 */
import Link from "next/link";
import { requireAuth } from "@/lib/auth/session";
import { listCampaigns } from "@/server/queries";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, EmptyState,
} from "@/components/ui/table";
import { Plus, Send, ArrowUpRight, MailOpen } from "lucide-react";
import { CampaignStatusBadge } from "@/components/dashboard/campaign-status-badge";
import { formatNumber, formatPercent, timeAgo } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const { account } = await requireAuth();
  const rows = await listCampaigns(account.id);

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="All your broadcasts, automations, and drafts"
        actions={
          <Button asChild>
            <Link href="/campaigns/new"><Plus className="mr-1 h-4 w-4" />New campaign</Link>
          </Button>
        }
      />
      <PageBody>
        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<MailOpen className="h-10 w-10" />}
                  title="No campaigns yet"
                  description="Your first newsletter is one click away."
                  action={
                    <Button asChild>
                      <Link href="/campaigns/new"><Plus className="mr-1 h-4 w-4" />Create campaign</Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Recipients</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Click</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => {
                    const openR = c.sentCount ? c.openCount / c.sentCount : 0;
                    const clickR = c.sentCount ? c.clickCount / c.sentCount : 0;
                    const date = c.sentAt ?? c.scheduledFor ?? c.createdAt;
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">
                            {c.subject || "(untitled)"}
                          </Link>
                          {c.preheader && (
                            <div className="text-xs text-muted-foreground truncate max-w-xs">{c.preheader}</div>
                          )}
                        </TableCell>
                        <TableCell><CampaignStatusBadge status={c.status} /></TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{c.type}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(c.totalRecipients)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(openR)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(clickR)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(date)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/campaigns/${c.id}`}><ArrowUpRight className="h-4 w-4" /></Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
