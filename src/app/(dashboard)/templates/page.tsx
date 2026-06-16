/**
 * templates/page.tsx — Saved email templates.
 *
 * Templates are reusable EmailDocument blobs. The MVP exposes the table with
 * basic CRUD via campaigns (you can mark any campaign content as a template).
 * A dedicated template builder is left for a future iteration; the data model
 * already supports it (see `templates` table in schema.ts).
 */
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, EmptyState,
} from "@/components/ui/table";
import { FileText, Plus } from "lucide-react";
import { formatDate } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const { account } = await requireAuth();
  const rows = await db
    .select()
    .from(templates)
    .where(eq(templates.accountId, account.id))
    .orderBy(desc(templates.createdAt));

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable starting points for new campaigns"
        actions={
          <Button asChild>
            <Link href="/campaigns/new"><Plus className="mr-1 h-4 w-4" />Start a campaign</Link>
          </Button>
        }
      />
      <PageBody>
        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<FileText className="h-10 w-10" />}
                  title="No saved templates"
                  description="Save any campaign as a template from the campaign editor's menu."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(t.createdAt)}</TableCell>
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
