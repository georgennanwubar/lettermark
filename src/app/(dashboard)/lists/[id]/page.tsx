/**
 * lists/[id]/page.tsx — View and edit a single list: rename, add/remove subscribers.
 */
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { getList, getListMembers, getSubscribersNotInList } from "@/server/queries";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, EmptyState,
} from "@/components/ui/table";
import { ArrowLeft, UserMinus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { updateList, addToList, removeFromList } from "../actions";
import { formatDate } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }

export default async function ListDetailPage({ params }: PageProps) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const { account } = await requireAuth();
  const list = await getList(account.id, id);
  if (!list) notFound();

  const [members, nonMembers] = await Promise.all([
    getListMembers(account.id, id),
    getSubscribersNotInList(account.id, id),
  ]);

  return (
    <>
      <PageHeader
        title={list.name}
        description={`${list.subscriberCount} subscriber${list.subscriberCount !== 1 ? "s" : ""}`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/lists"><ArrowLeft className="mr-1 h-3.5 w-3.5" />All Lists</Link>
          </Button>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Edit name / description */}
          <Card>
            <CardHeader>
              <CardTitle>List settings</CardTitle>
              <CardDescription>Edit name and description</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={updateList} className="space-y-4">
                <input type="hidden" name="id" value={id} />
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" defaultValue={list.name} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" name="description" defaultValue={list.description ?? ""} placeholder="Optional description" />
                </div>
                <Button type="submit" size="sm" className="w-full">Save changes</Button>
              </form>
            </CardContent>
          </Card>

          {/* Members */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" />Members
                <span className="ml-auto text-sm font-normal text-muted-foreground">{members.length} total</span>
              </CardTitle>
              <CardDescription>Subscribers currently in this list</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {members.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={<Users className="h-8 w-8" />}
                    title="No members yet"
                    description="Add subscribers from the section below."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subscriber</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="font-medium">{m.firstName || m.lastName ? `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() : m.email}</div>
                          {(m.firstName || m.lastName) && <div className="text-xs text-muted-foreground">{m.email}</div>}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            m.status === "subscribed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : m.status === "pending" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-muted text-muted-foreground"
                          }`}>
                            {m.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(m.addedAt)}</TableCell>
                        <TableCell className="text-right">
                          <form action={removeFromList}>
                            <input type="hidden" name="listId" value={id} />
                            <input type="hidden" name="subscriberId" value={m.id} />
                            <Button type="submit" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" title="Remove from list">
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Add subscribers */}
        {nonMembers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" />Add subscribers
              </CardTitle>
              <CardDescription>
                {nonMembers.length} subscriber{nonMembers.length !== 1 ? "s" : ""} not yet in this list
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subscriber</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nonMembers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{s.firstName || s.lastName ? `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() : s.email}</div>
                        {(s.firstName || s.lastName) && <div className="text-xs text-muted-foreground">{s.email}</div>}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status === "subscribed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : s.status === "pending" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-muted text-muted-foreground"
                        }`}>
                          {s.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={addToList}>
                          <input type="hidden" name="listId" value={id} />
                          <input type="hidden" name="subscriberId" value={s.id} />
                          <Button type="submit" variant="ghost" size="icon" className="text-primary hover:bg-primary/10" title="Add to list">
                            <UserPlus className="h-4 w-4" />
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </PageBody>
    </>
  );
}
