import Link from "next/link";
import { requireAuth } from "@/lib/auth/session";
import { listForms } from "@/server/queries";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, EmptyState,
} from "@/components/ui/table";
import { MailPlus, ArrowUpRight } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils/cn";
import { CreateFormButton } from "./create-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forms" };

export default async function FormsPage() {
  const { account } = await requireAuth();
  const rows = await listForms(account.id);
  return (
    <>
      <PageHeader title="Forms" description="Capture subscribers on your site or via a hosted landing page" actions={<CreateFormButton />} />
      <PageBody>
        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<MailPlus className="h-10 w-10" />}
                  title="No forms yet"
                  description="Create a signup form to capture new subscribers."
                  action={<CreateFormButton />}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Submissions</TableHead>
                    <TableHead className="text-right">Conversions</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>
                        <Link href={`/forms/${f.id}`} className="font-medium hover:underline">{f.name}</Link>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{f.type}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(f.submissions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(f.conversions)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(f.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/forms/${f.id}`}><ArrowUpRight className="h-4 w-4" /></Link>
                        </Button>
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
