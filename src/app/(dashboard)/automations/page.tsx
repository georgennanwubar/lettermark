import Link from "next/link";
import { requireAuth } from "@/lib/auth/session";
import { listWorkflows } from "@/server/queries";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, EmptyState,
} from "@/components/ui/table";
import { Workflow, ArrowUpRight } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils/cn";
import { CreateWorkflowButton } from "./create-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Automations" };

const variantFor = (s: string) =>
  s === "active" ? "success" : s === "paused" ? "warning" : "outline";

export default async function AutomationsPage() {
  const { account } = await requireAuth();
  const rows = await listWorkflows(account.id);
  return (
    <>
      <PageHeader title="Automations" description="Triggered workflows for nurture and onboarding" actions={<CreateWorkflowButton />} />
      <PageBody>
        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Workflow className="h-10 w-10" />}
                  title="No automations yet"
                  description="Build a workflow to nurture subscribers automatically."
                  action={<CreateWorkflowButton />}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Enrolled</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>
                        <Link href={`/automations/${w.id}`} className="font-medium hover:underline">{w.name}</Link>
                        {w.description && <div className="text-xs text-muted-foreground truncate max-w-xs">{w.description}</div>}
                      </TableCell>
                      <TableCell><Badge variant={variantFor(w.status) as any} className="capitalize">{w.status}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(w.enrolledCount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(w.completedCount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(w.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/automations/${w.id}`}><ArrowUpRight className="h-4 w-4" /></Link>
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
