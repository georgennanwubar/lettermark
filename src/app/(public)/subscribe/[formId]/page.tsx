/**
 * /subscribe/[formId] — Hosted version of a signup form.
 *
 * Renders a clean signup page using the form's schema. Submits to /api/subscribe
 * via a regular HTML form (works without JS).
 */
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { forms, accounts } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ formId: string }>;
  searchParams: Promise<{ status?: string }>;
}

interface FieldSchema {
  type?: string;
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
}

interface FormSchema {
  title?: string;
  description?: string;
  buttonLabel?: string;
  fields: FieldSchema[];
}

export default async function HostedSubscribePage({ params, searchParams }: PageProps) {
  const { formId: idParam } = await params;
  const sp = await searchParams;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const form = await db.query.forms.findFirst({ where: eq(forms.id, id) });
  if (!form) notFound();
  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, form.accountId) });
  if (!account) notFound();

  const schema = (form.schema as FormSchema) ?? {
    title: `Subscribe to ${account.name}`,
    fields: [{ key: "email", label: "Email", type: "email", required: true }],
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{schema.title ?? `Subscribe to ${account.name}`}</h1>
        {schema.description && (
          <p className="mt-1.5 text-sm text-muted-foreground">{schema.description}</p>
        )}

        {sp.status === "pending" ? (
          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            Almost there! Check your inbox to confirm your subscription.
          </div>
        ) : sp.status === "subscribed" ? (
          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            You&apos;re subscribed. Welcome!
          </div>
        ) : (
          <form action="/api/subscribe" method="post" className="mt-6 space-y-4">
            {sp.status === "error" && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                That didn&apos;t work — check your email address and try again.
              </div>
            )}
            <input type="hidden" name="formId" value={form.id} />
            {/* Honeypot — hidden from real users, often filled by bots */}
            <input
              type="text"
              name="_honeypot"
              tabIndex={-1}
              aria-hidden="true"
              autoComplete="off"
              className="absolute -left-[9999px] h-0 w-0"
            />

            {(schema.fields ?? []).map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key}>{f.label}{f.required && <span className="ml-0.5 text-destructive">*</span>}</Label>
                <Input
                  id={f.key}
                  name={f.key}
                  type={f.type ?? "text"}
                  required={f.required}
                  placeholder={f.placeholder}
                />
              </div>
            ))}

            <Button type="submit" className="w-full">{schema.buttonLabel ?? "Subscribe"}</Button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By subscribing you agree to receive emails from {account.name}. You can unsubscribe at any time.
        </p>
      </div>
    </div>
  );
}
