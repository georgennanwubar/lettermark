"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { updateAccount } from "./actions";

interface Props {
  name: string;
  defaultFromName: string;
  defaultFromEmail: string;
  defaultReplyTo: string;
}

export function AccountForm(props: Props) {
  const [state, action, pending] = useActionState(updateAccount, { ok: false } as any);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Workspace name</Label>
        <Input id="name" name="name" defaultValue={props.name} required />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="defaultFromName">Default from name</Label>
          <Input id="defaultFromName" name="defaultFromName" defaultValue={props.defaultFromName} placeholder="Your name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="defaultFromEmail">Default from email</Label>
          <Input id="defaultFromEmail" name="defaultFromEmail" type="email" defaultValue={props.defaultFromEmail} placeholder="you@yourdomain.com" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="defaultReplyTo">Reply-to (optional)</Label>
        <Input id="defaultReplyTo" name="defaultReplyTo" type="email" defaultValue={props.defaultReplyTo} />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-600">Saved.</p>}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
    </form>
  );
}
