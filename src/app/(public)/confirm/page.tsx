/**
 * /confirm — Double opt-in landing page.
 *
 * Validates the HMAC signature, marks the subscriber as subscribed, and
 * (optionally) redirects to the form's configured confirmRedirectUrl.
 */
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscribers, forms } from "@/lib/db/schema";
import { verifyTracking } from "@/lib/email/tracking";
import { triggerWorkflows } from "@/lib/automation/runner";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ s?: string; f?: string; t?: string }>;
}

export default async function ConfirmPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const hash = sp.s;
  const formId = Number(sp.f);
  const sig = sp.t;

  if (!hash || !sig || !Number.isFinite(formId) || !verifyTracking(`confirm:${hash}:${formId}`, sig)) {
    return <Result kind="error" title="This confirmation link is invalid" />;
  }

  const sub = await db.query.subscribers.findFirst({ where: eq(subscribers.hash, hash) });
  if (!sub) return <Result kind="error" title="We couldn't find that subscription" />;

  if (sub.status !== "subscribed") {
    await db
      .update(subscribers)
      .set({ status: "subscribed", confirmAt: new Date() })
      .where(eq(subscribers.id, sub.id));
    await triggerWorkflows(sub.accountId, "signup", sub.id);
  }

  const form = await db.query.forms.findFirst({ where: eq(forms.id, formId) });
  if (form?.confirmRedirectUrl) {
    redirect(form.confirmRedirectUrl);
  }

  return <Result kind="success" title="You're confirmed!" message="Thanks for subscribing. We'll be in touch." />;
}

function Result({ kind, title, message }: { kind: "success" | "error"; title: string; message?: string }) {
  const icon = kind === "success" ? "✓" : "!";
  const tint = kind === "success" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200";
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl ring-1 ${tint}`}>{icon}</div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}
