"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select-tabs";
import { toast } from "sonner";
import { upsertProvider } from "./actions";

type Kind = "smtp" | "resend" | "mailgun" | "sendgrid" | "postmark" | "ses";

const FIELDS_BY_KIND: Record<Kind, { key: string; label: string; placeholder?: string; type?: string }[]> = {
  smtp: [
    { key: "host", label: "Host", placeholder: "smtp.example.com" },
    { key: "port", label: "Port", placeholder: "587" },
    { key: "username", label: "Username" },
    { key: "password", label: "Password", type: "password" },
    { key: "secure", label: "Use TLS (true/false)", placeholder: "true" },
  ],
  resend: [{ key: "apiKey", label: "API key", type: "password", placeholder: "re_..." }],
  mailgun: [
    { key: "apiKey", label: "API key", type: "password" },
    { key: "domain", label: "Domain", placeholder: "mg.yourdomain.com" },
    { key: "region", label: "Region (us/eu)", placeholder: "us" },
  ],
  sendgrid: [{ key: "apiKey", label: "API key", type: "password", placeholder: "SG..." }],
  postmark: [{ key: "serverToken", label: "Server token", type: "password" }],
  ses: [
    { key: "accessKeyId", label: "AWS access key ID" },
    { key: "secretAccessKey", label: "AWS secret access key", type: "password" },
    { key: "region", label: "Region", placeholder: "us-east-1" },
  ],
};

interface Props {
  initial: { kind: string; name: string; credentials: Record<string, string> } | null;
}

export function DeliveryForm({ initial }: Props) {
  const [kind, setKind] = React.useState<Kind>((initial?.kind as Kind) ?? "smtp");
  const [name, setName] = React.useState(initial?.name ?? "Primary provider");
  const [creds, setCreds] = React.useState<Record<string, string>>(initial?.credentials ?? {});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (initial && (initial.kind as Kind) === kind) return;
    // Reset creds when kind changes to a different provider
    if (!initial || initial.kind !== kind) {
      setCreds((c) => (Object.keys(c).length === 0 ? c : {}));
    }
  }, [kind, initial]);

  const fields = FIELDS_BY_KIND[kind];

  const save = async () => {
    setSaving(true);
    const r = await upsertProvider({ kind, name, credentials: creds });
    setSaving(false);
    if (r.ok) toast.success("Provider saved");
    else toast.error(r.error ?? "Couldn't save");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="kind">Provider</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger id="kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="smtp">SMTP</SelectItem>
              <SelectItem value="resend">Resend</SelectItem>
              <SelectItem value="mailgun">Mailgun</SelectItem>
              <SelectItem value="sendgrid">SendGrid</SelectItem>
              <SelectItem value="postmark">Postmark</SelectItem>
              <SelectItem value="ses">Amazon SES</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="provider-name">Display name</Label>
          <Input id="provider-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`f-${f.key}`}>{f.label}</Label>
            <Input
              id={`f-${f.key}`}
              type={f.type ?? "text"}
              placeholder={f.placeholder}
              value={creds[f.key] ?? ""}
              onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
            />
          </div>
        ))}
      </div>

      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save delivery settings"}</Button>
    </div>
  );
}
