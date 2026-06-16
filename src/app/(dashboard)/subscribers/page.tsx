/**
 * subscribers/page.tsx — Paginated subscribers list with search + status filter.
 *
 * Server component; uses URL search params for filter state so pagination is
 * link-shareable and browser back/forward works naturally.
 */
import Link from "next/link";
import { requireAuth } from "@/lib/auth/session";
import { listSubscribers } from "@/server/queries";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, EmptyState,
} from "@/components/ui/table";
import { SubscriberStatusBadge } from "@/components/dashboard/campaign-status-badge";
import { Users, Plus, Search, Upload } from "lucide-react";
import { formatDate } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subscribers" };

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}

export default async function SubscribersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { account } = await requireAuth();
  const { rows, total } = await listSubscribers(account.id, {
    limit: PAGE_SIZE,
    offset,
    search: sp.q || undefined,
    status: sp.status || undefined,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Subscribers"
        description={`${total.toLocaleString()} total`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/subscribers/import"><Upload className="mr-1 h-4 w-4" />Import</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/subscribers/new"><Plus className="mr-1 h-4 w-4" />Add subscriber</Link>
            </Button>
          </div>
        }
      />
      <PageBody>
        {/* Filter bar */}
        <form className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search by email…" className="pl-8" />
            </div>
          </div>
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="subscribed">Subscribed</option>
            <option value="pending">Pending</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="hard_bounced">Hard bounced</option>
            <option value="soft_bounced">Soft bounced</option>
            <option value="complained">Complained</option>
          </select>
          <Button type="submit" variant="outline" size="sm">Filter</Button>
        </form>

        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Users className="h-10 w-10" />}
                  title={sp.q || sp.status ? "No matches" : "No subscribers yet"}
                  description={sp.q || sp.status ? "Try a different filter." : "Add your first subscriber or share a signup form."}
                  action={
                    !sp.q && !sp.status ? (
                      <Button asChild>
                        <Link href="/subscribers/new"><Plus className="mr-1 h-4 w-4" />Add subscriber</Link>
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link href={`/subscribers/${s.id}`} className="font-medium hover:underline">{s.email}</Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[s.firstName, s.lastName].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell><SubscriberStatusBadge status={s.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.country || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(s.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/subscribers/${s.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={buildHref(sp, page - 1)}>Previous</Link>
                </Button>
              )}
              {page < totalPages && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={buildHref(sp, page + 1)}>Next</Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

function buildHref(sp: Record<string, string | undefined>, page: number): string {
  const p = new URLSearchParams();
  if (sp.q) p.set("q", sp.q);
  if (sp.status) p.set("status", sp.status);
  p.set("page", String(page));
  return `/subscribers?${p.toString()}`;
}
