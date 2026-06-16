"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { importSubscribers } from "../actions";

export function ImportForm() {
  const [state, action, pending] = useActionState(importSubscribers, { ok: false } as any);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="csv">CSV data</Label>
        <Textarea
          id="csv"
          name="csv"
          rows={10}
          className="font-mono text-xs"
          placeholder={`email,first_name,last_name,status\nalice@example.com,Alice,Smith,subscribed\nbob@example.com,Bob,,subscribed`}
        />
      </div>
      {state?.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{state.error}</div>
      )}
      {state?.ok && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Imported {state.inserted} subscriber{state.inserted === 1 ? "" : "s"}.{" "}
          {state.skipped > 0 && `Skipped ${state.skipped} (already on the list or invalid).`}
        </div>
      )}
      <Button type="submit" disabled={pending}>{pending ? "Importing…" : "Import"}</Button>
    </form>
  );
}
