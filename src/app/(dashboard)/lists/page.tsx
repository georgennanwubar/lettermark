/**
 * lists/page.tsx — List of subscriber lists.
 *
 * Each list = a named subset of the audience. Subscribers can belong to many.
 * Lists with target_lists references in forms drive new-signup placement.
 */
import { requireAuth } from "@/lib/auth/session";
import { listLists } from "@/server/queries";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, EmptyState,
} from "@/components/ui/table";
import { ListChecks, Trash2 } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils/cn";
import { CreateListButton } from "./create-button";
import { deleteList } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lists" };

export default async function ListsPage() {
  const { account } = await requireAuth();
  const rows = await listLists(account.id);

  return (
    <>
      <PageHeader
        title="Lists"
        description="Named subsets of your audience"
        actions={<CreateListButton />}
      />
      <PageBody>
        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<ListChecks className="h-10 w-10" />}
                  title="No lists yet"
                  description="Create a list to organize your audience by interest or source."
                  action={<CreateListButton />}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Subscribers</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium">{l.name}</div>
                        {l.description && <div className="text-xs text-muted-foreground">{l.description}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(l.subscriberCount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(l.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <form action={deleteList}>
                          <input type="hidden" name="id" value={l.id} />
                          <Button type="submit" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
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
      </PageBody>
    </>
  );
}
