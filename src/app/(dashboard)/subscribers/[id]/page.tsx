/**
 * subscribers/[id]/page.tsx — One subscriber's profile.
 */
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { getSubscriber } from "@/server/queries";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, Separator } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubscriberStatusBadge } from "@/components/dashboard/campaign-status-badge";
import { formatDate } from "@/lib/utils/cn";
import { Trash2, UserMinus } from "lucide-react";
import { deleteSubscriber, unsubscribeSubscriber } from "../actions";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }

export default async function SubscriberDetailPage({ params }: PageProps) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();
  const { account } = await requireAuth();
  const sub = await getSubscriber(account.id, id);
  if (!sub) notFound();

  const customFields = (sub.customFields ?? {}) as Record<string, unknown>;

  return (
    <>
      <PageHeader
        title={sub.email}
        description={[sub.firstName, sub.lastName].filter(Boolean).join(" ") || undefined}
        actions={<SubscriberStatusBadge status={sub.status} />}
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Email">{sub.email}</Row>
              <Row label="First name">{sub.firstName || "—"}</Row>
              <Row label="Last name">{sub.lastName || "—"}</Row>
              <Row label="Country">{sub.country || "—"}</Row>
              <Row label="Timezone">{sub.timezone || "—"}</Row>
              <Row label="Locale">{sub.locale || "—"}</Row>
              <Row label="Engagement rating">{Number(sub.rating).toFixed(2)}</Row>
              <Separator />
              <Row label="Signed up">{sub.signupAt ? formatDate(sub.signupAt) : "—"}</Row>
              <Row label="Confirmed">{sub.confirmAt ? formatDate(sub.confirmAt) : "—"}</Row>
              <Row label="Unsubscribed">{sub.unsubscribeAt ? formatDate(sub.unsubscribeAt) : "—"}</Row>
              <Row label="Created">{formatDate(sub.createdAt)}</Row>

              {Object.keys(customFields).length > 0 && (
                <>
                  <Separator />
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom fields</div>
                  {Object.entries(customFields).map(([k, v]) => (
                    <Row key={k} label={k}>{String(v)}</Row>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {sub.status !== "unsubscribed" && (
                <form action={unsubscribeSubscriber}>
                  <input type="hidden" name="id" value={sub.id} />
                  <Button type="submit" variant="outline" className="w-full">
                    <UserMinus className="mr-1 h-4 w-4" />Unsubscribe
                  </Button>
                </form>
              )}
              <form action={deleteSubscriber}>
                <input type="hidden" name="id" value={sub.id} />
                <Button type="submit" variant="ghost" className="w-full text-destructive hover:bg-destructive/10">
                  <Trash2 className="mr-1 h-4 w-4" />Delete permanently
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right break-all">{children}</span>
    </div>
  );
}
