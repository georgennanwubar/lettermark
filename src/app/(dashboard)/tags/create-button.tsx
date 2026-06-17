"use client";
import * as React from "react";
import { useActionState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { createTag } from "./actions";

export function CreateTagButton() {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = useActionState(createTag, { ok: false });
  const [prevState, setPrevState] = React.useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.ok) setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1 h-4 w-4" />New tag</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create tag</DialogTitle></DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="color">Color</Label>
            <Input id="color" name="color" type="color" defaultValue="#6366f1" className="h-9 w-20 p-1" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create tag"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
