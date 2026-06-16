/**
 * analytics/page.tsx — Workspace-level metrics.
 *
 * Aggregates engagement across all campaigns in the account. For the MVP this
 * reuses the same overview helpers; per-campaign drill-downs live on the
 * campaign detail page.
 */
import { requireAuth } from "@/lib/auth/session";
import { getOverviewStats, getGrowthSeries } from "@/server/queries";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { formatNumber, formatPercent } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const { account } = await requireAuth();
  const [stats, growth] = await Promise.all([
    getOverviewStats(account.id),
    getGrowthSeries(account.id, 90),
  ]);

  const openR = stats.sentLast30 ? stats.opensLast30 / stats.sentLast30 : 0;
  const clickR = stats.sentLast30 ? stats.clicksLast30 / stats.sentLast30 : 0;
  const ctor = stats.opensLast30 ? stats.clicksLast30 / stats.opensLast30 : 0;

  return (
    <>
      <PageHeader title="Analytics" description="Engagement across your workspace" />
      <PageBody>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Metric label="Active subscribers" value={formatNumber(stats.subscribers.active)} />
          <Metric label="Sent (30d)" value={formatNumber(stats.sentLast30)} />
          <Metric label="Open rate" value={formatPercent(openR)} />
          <Metric label="Click rate" value={formatPercent(clickR)} />
          <Metric label="Click-to-open" value={formatPercent(ctor)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Audience growth — last 90 days</CardTitle>
            <CardDescription>Net subscriber change</CardDescription>
          </CardHeader>
          <CardContent>
            <GrowthChart data={growth} />
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
