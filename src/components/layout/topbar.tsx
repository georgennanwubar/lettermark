/**
 * topbar.tsx — Sticky header above each dashboard page.
 *
 * Pages set their title via the PageHeader subcomponent (server-rendered, no
 * context needed — keeps the title in source where the page lives).
 */
"use client";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 border-b border-border bg-background/80 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6", className)}>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-0.5 truncate text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Spacer wrapper for page body content — gives consistent gutters. */
export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex-1 space-y-6 p-4 sm:p-6", className)}>{children}</div>;
}
