"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select-tabs";
import { createCampaign, type ActionResult } from "../actions";

const initial: ActionResult = { ok: false };

export function NewCampaignForm() {
  const [state, action, pending] = useActionState(createCampaign, initial);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="subject">Subject line</Label>
        <Input id="subject" name="subject" placeholder="Spring updates from Acme" required autoFocus />
        <p className="text-xs text-muted-foreground">This is what shows up in the recipient&apos;s inbox.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="type">Campaign type</Label>
        <Select name="type" defaultValue="standard">
          <SelectTrigger id="type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard broadcast</SelectItem>
            <SelectItem value="automation">Automation step</SelectItem>
            <SelectItem value="autoresponder">Autoresponder series</SelectItem>
            <SelectItem value="rss">RSS to email</SelectItem>
            <SelectItem value="transactional">Transactional</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {state.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{state.error}</div>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Continue to editor"}
      </Button>
    </form>
  );
}
