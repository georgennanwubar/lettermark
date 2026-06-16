"use client";
import * as React from "react";
import { useActionState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch,
} from "@/components/ui/select-tabs";
import { Plus } from "lucide-react";
import { createForm } from "./actions";

export function CreateFormButton() {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = useActionState(createForm, { ok: false } as any);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />New form</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create form</DialogTitle></DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required autoFocus placeholder="Homepage signup" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">Type</Label>
            <Select name="type" defaultValue="inline">
              <SelectTrigger id="type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inline">Inline (embed)</SelectItem>
                <SelectItem value="popup">Popup</SelectItem>
                <SelectItem value="embedded">Embedded</SelectItem>
                <SelectItem value="landing">Hosted landing page</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label htmlFor="doubleOptIn" className="font-medium">Double opt-in</Label>
              <p className="text-xs text-muted-foreground">Send a confirmation email before subscribing</p>
            </div>
            <Switch id="doubleOptIn" name="doubleOptIn" defaultChecked />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create form"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
