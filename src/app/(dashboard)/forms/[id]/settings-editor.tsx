"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/select-tabs";
import { toast } from "sonner";
import { updateForm } from "../actions";

export function FormSettingsEditor({ form }: { form: any }) {
  const [name, setName] = React.useState(form.name);
  const [doubleOptIn, setDoubleOptIn] = React.useState(form.doubleOptIn);
  const [successUrl, setSuccessUrl] = React.useState(form.successUrl ?? "");
  const [confirmRedirectUrl, setConfirmRedirectUrl] = React.useState(form.confirmRedirectUrl ?? "");
  const [schemaText, setSchemaText] = React.useState(JSON.stringify(form.schema, null, 2));
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    let schema: unknown;
    try {
      schema = JSON.parse(schemaText);
    } catch {
      toast.error("Schema isn't valid JSON");
      return;
    }
    setSaving(true);
    const r = await updateForm({
      id: form.id,
      name,
      doubleOptIn,
      successUrl: successUrl || null,
      confirmRedirectUrl: confirmRedirectUrl || null,
      schema,
    });
    setSaving(false);
    if (r.ok) toast.success("Saved");
    else toast.error(r.error ?? "Couldn't save");
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <div>
          <Label className="font-medium">Double opt-in</Label>
          <p className="text-xs text-muted-foreground">Send a confirmation email before activating</p>
        </div>
        <Switch checked={doubleOptIn} onCheckedChange={setDoubleOptIn} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="successUrl">Post-submit redirect URL</Label>
          <Input id="successUrl" value={successUrl} onChange={(e) => setSuccessUrl(e.target.value)} placeholder="https://example.com/thanks" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmRedirectUrl">After confirmation URL</Label>
          <Input id="confirmRedirectUrl" value={confirmRedirectUrl} onChange={(e) => setConfirmRedirectUrl(e.target.value)} placeholder="https://example.com/welcome" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="schema">Field schema (JSON)</Label>
        <Textarea
          id="schema"
          rows={14}
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Shape: <code className="rounded bg-muted px-1">{`{ title, description, buttonLabel, fields: [{ key, label, type, required }] }`}</code>
        </p>
      </div>

      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
    </div>
  );
}
