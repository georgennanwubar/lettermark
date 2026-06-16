import { requireAuth } from "@/lib/auth/session";
import { listTags } from "@/server/queries";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, EmptyState,
} from "@/components/ui/table";
import { Tag, Trash2 } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils/cn";
import { CreateTagButton } from "./create-button";
import { deleteTag } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tags" };

export default async function TagsPage() {
  const { account } = await requireAuth();
  const rows = await listTags(account.id);

  return (
    <>
      <PageHeader title="Tags" description="Flexible labels for segmentation" actions={<CreateTagButton />} />
      <PageBody>
        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Tag className="h-10 w-10" />}
                  title="No tags yet"
                  description="Tags work like labels — apply many per subscriber for fine-grained targeting."
                  action={<CreateTagButton />}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tag</TableHead>
                    <TableHead className="text-right">Subscribers</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {t.color && <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />}
                          <span className="font-medium">{t.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(t.subscriberCount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(t.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <form action={deleteTag}>
                          <input type="hidden" name="id" value={t.id} />
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
