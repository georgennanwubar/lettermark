"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select-tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge } from "@/components/ui/card";
import { toast } from "sonner";
import { updateWorkflow } from "../actions";
import { Save, Play, Pause } from "lucide-react";

interface Props {
  workflow: { id: number; name: string; description: string; status: string; graph: any };
}

export function WorkflowEditor({ workflow }: Props) {
  const [name, setName] = React.useState(workflow.name);
  const [description, setDescription] = React.useState(workflow.description);
  const [status, setStatus] = React.useState(workflow.status);
  const [graphText, setGraphText] = React.useState(JSON.stringify(workflow.graph, null, 2));
  const [saving, setSaving] = React.useState(false);

  const { parsed, parseError } = React.useMemo(() => {
    try {
      return { parsed: JSON.parse(graphText), parseError: null as string | null };
    } catch (e: any) {
      return { parsed: workflow.graph, parseError: e.message as string };
    }
  }, [graphText, workflow.graph]);

  const save = async () => {
    if (parseError) {
      toast.error("Fix the graph JSON first");
      return;
    }
    setSaving(true);
    const r = await updateWorkflow({
      id: workflow.id,
      name,
      description,
      status: status as any,
      graph: parsed,
    });
    setSaving(false);
    if (r.ok) toast.success("Saved");
    else toast.error(r.error ?? "Couldn't save");
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Graph</CardTitle>
          <CardDescription>The runner reads this graph to advance subscribers through the workflow.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            rows={20}
            value={graphText}
            onChange={(e) => setGraphText(e.target.value)}
            className="font-mono text-xs"
          />
          {parseError && <p className="text-sm text-destructive">JSON error: {parseError}</p>}

          <details className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <summary className="cursor-pointer font-medium">Node reference</summary>
            <div className="mt-2 space-y-1 text-muted-foreground">
              <p><code className="rounded bg-muted px-1">{`{ type: "delay", config: { days?, hours?, minutes? }, next }`}</code></p>
              <p><code className="rounded bg-muted px-1">{`{ type: "send-campaign", config: { campaignId }, next }`}</code></p>
              <p><code className="rounded bg-muted px-1">{`{ type: "add-tag" | "remove-tag", config: { tagId }, next }`}</code></p>
              <p><code className="rounded bg-muted px-1">{`{ type: "add-to-list" | "remove-from-list", config: { listId }, next }`}</code></p>
              <p><code className="rounded bg-muted px-1">{`{ type: "condition", config: { field, op, value }, branches: { yes, no } }`}</code></p>
              <p><code className="rounded bg-muted px-1">{`{ type: "end" }`}</code></p>
            </div>
          </details>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={save} disabled={saving} className="w-full">
              {saving ? "Saving…" : <><Save className="mr-1 h-4 w-4" />Save changes</>}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
          <CardContent>
            <GraphPreview graph={parsed} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GraphPreview({ graph }: { graph: any }) {
  if (!graph?.nodes) return <p className="text-xs text-muted-foreground">No nodes yet.</p>;
  const byId: Record<string, any> = {};
  for (const n of graph.nodes) byId[n.id] = n;
  const start = graph.triggers?.[0]?.next ?? graph.nodes[0]?.id;

  // Walk linearly (branches are noted but not deeply traversed)
  const seen = new Set<string>();
  const path: any[] = [];
  let curr = start;
  while (curr && !seen.has(curr)) {
    seen.add(curr);
    const node = byId[curr];
    if (!node) break;
    path.push(node);
    curr = node.next;
  }
  return (
    <ol className="space-y-1.5 text-xs">
      <li className="flex items-center gap-2">
        <Badge variant="info">trigger</Badge>
        <span>{graph.triggers?.[0]?.type ?? "—"}</span>
      </li>
      {path.map((n) => (
        <li key={n.id} className="flex items-center gap-2 pl-4">
          <Badge variant="outline">{n.type}</Badge>
          <span className="text-muted-foreground">{summarize(n)}</span>
        </li>
      ))}
    </ol>
  );
}

function summarize(n: any): string {
  switch (n.type) {
    case "delay": return [n.config?.days && `${n.config.days}d`, n.config?.hours && `${n.config.hours}h`, n.config?.minutes && `${n.config.minutes}m`].filter(Boolean).join(" ") || "—";
    case "send-campaign": return `campaign #${n.config?.campaignId ?? "—"}`;
    case "add-tag": case "remove-tag": return `tag #${n.config?.tagId ?? "—"}`;
    case "add-to-list": case "remove-from-list": return `list #${n.config?.listId ?? "—"}`;
    case "condition": return `${n.config?.field ?? ""} ${n.config?.op ?? ""} ${n.config?.value ?? ""}`;
    default: return "";
  }
}
