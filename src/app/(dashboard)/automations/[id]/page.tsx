/**
 * automations/[id]/page.tsx — Workflow editor.
 *
 * For the MVP, the graph is edited as JSON with a syntax cheat-sheet. The
 * runner accepts the graph as-is, so this is functional even before a visual
 * builder lands. A textual graph view is rendered next to the JSON so users
 * can sanity-check the flow.
 */
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { PageHeader, PageBody } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { deleteWorkflow } from "../actions";
import { WorkflowEditor } from "./workflow-editor";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }

export default async function AutomationDetailPage({ params }: PageProps) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();
  const { account } = await requireAuth();
  const w = await db.query.workflows.findFirst({
    where: and(eq(workflows.accountId, account.id), eq(workflows.id, id)),
  });
  if (!w) notFound();

  return (
    <>
      <PageHeader
        title={w.name}
        description={w.description ?? undefined}
        actions={
          <Badge variant={w.status === "active" ? "success" : w.status === "paused" ? "warning" : "outline"} className="capitalize">
            {w.status}
          </Badge>
        }
      />
      <PageBody>
        <WorkflowEditor workflow={{
          id: w.id,
          name: w.name,
          description: w.description ?? "",
          status: w.status,
          graph: w.graph,
        }} />

        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Delete</CardTitle>
            <CardDescription>Removes the workflow and all enrollment data.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={deleteWorkflow}>
              <input type="hidden" name="id" value={w.id} />
              <Button type="submit" variant="ghost" className="text-destructive hover:bg-destructive/10">
                <Trash2 className="mr-1 h-4 w-4" />Delete automation
              </Button>
            </form>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
