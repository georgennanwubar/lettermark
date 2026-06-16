/**
 * dashboard/page.tsx — Workspace overview.
 *
 * Layout: 4 stat cards (subscribers, campaigns, opens, clicks) on top,
 * growth chart + recent campaigns side-by-side on lg screens (stacked on sm).
 */
import Link from "next/link";
import { requireAuth } from "@/lib/auth/session";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, EmptyState } from "@/components/ui/table";
import { Users, Send, Eye, MousePointerClick, Plus, ArrowRight, MailOpen } from "lucide-react";
import {
  getOverviewStats,
  getGrowthSeries,
  getRecentCampaigns,
} from "@/server/queries";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { formatNumber, formatPercent, timeAgo } from "@/lib/utils/cn";
import { CampaignStatusBadge } from "@/components/dashboard/campaign-status-badge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { account } = await requireAuth();
  const [stats, growth, recent] = await Promise.all([
    getOverviewStats(account.id),
    getGrowthSeries(account.id, 30),
    getRecentCampaigns(account.id, 6),
  ]);

  const openRate = stats.sentLast30 ? stats.opensLast30 / stats.sentLast30 : 0;
  const clickRate = stats.sentLast30 ? stats.clicksLast30 / stats.sentLast30 : 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Welcome back to ${account.name}`}
        actions={
          <Button asChild>
            <Link href="/campaigns/new"><Plus className="mr-1 h-4 w-4" />New campaign</Link>
          </Button>
        }
      />
      <PageBody>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Users} label="Subscribers" value={formatNumber(stats.subscribers.active)} hint={`${formatNumber(stats.subscribers.total)} total`} accent="primary" />
          <StatCard icon={Send} label="Sent (30d)" value={formatNumber(stats.sentLast30)} hint={`${stats.campaigns.sent} campaigns`} accent="emerald" />
          <StatCard icon={Eye} label="Open rate" value={formatPercent(openRate)} hint={`${formatNumber(stats.opensLast30)} opens`} accent="sky" />
          <StatCard icon={MousePointerClick} label="Click rate" value={formatPercent(clickRate)} hint={`${formatNumber(stats.clicksLast30)} clicks`} accent="violet" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Audience growth</CardTitle>
              <CardDescription>Subscribers added vs unsubscribed, last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <GrowthChart data={growth} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscriber breakdown</CardTitle>
              <CardDescription>By status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <BreakdownRow label="Subscribed" value={stats.subscribers.active} total={stats.subscribers.total} color="bg-emerald-500" />
              <BreakdownRow label="Pending confirmation" value={stats.subscribers.pending} total={stats.subscribers.total} color="bg-amber-500" />
              <BreakdownRow label="Unsubscribed" value={stats.subscribers.unsubscribed} total={stats.subscribers.total} color="bg-zinc-400" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent campaigns</CardTitle>
              <CardDescription>Your latest sends and drafts</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/campaigns">View all<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<MailOpen className="h-10 w-10" />}
                  title="No campaigns yet"
                  description="Create your first newsletter to start engaging your audience."
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
                    <TableHead className="text-right">Recipients</TableHead>
                    <TableHead className="text-right">Opens</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((c) => {
                    const openR = c.totalSent ? c.totalOpens / c.totalSent : 0;
                    const clickR = c.totalSent ? c.totalClicks / c.totalSent : 0;
                    const date = c.sentAt ?? c.scheduledAt ?? c.createdAt;
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                          {c.subject && <div className="text-xs text-muted-foreground truncate max-w-xs">{c.subject}</div>}
                        </TableCell>
                        <TableCell><CampaignStatusBadge status={c.status} /></TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(c.totalRecipients ?? 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(openR)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(clickR)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(date)}</TableCell>
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

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  accent: "primary" | "emerald" | "sky" | "violet";
}) {
  const tint = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  }[accent];

  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4 sm:p-5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tint}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
          {hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{formatNumber(value)}<span className="ml-1 text-xs text-muted-foreground">({pct}%)</span></span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
