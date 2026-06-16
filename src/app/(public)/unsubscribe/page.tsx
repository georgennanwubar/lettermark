/**
 * /unsubscribe — One-click unsubscribe landing.
 *
 * RFC 8058: a POST to this URL with valid signature must unsubscribe without
 * further interaction (for List-Unsubscribe-Post header support).
 * A GET shows a confirm screen with an optional reason field.
 */
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscribers, actionUnsubs } from "@/lib/db/schema";
import { verifyTracking } from "@/lib/email/tracking";
import { unsubscribeAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ s?: string; c?: string; t?: string }>;
}

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const hash = sp.s;
  const campaignId = sp.c ? Number(sp.c) : null;
  const sig = sp.t;

  const isValid =
    !!hash && !!sig &&
    verifyTracking(`${campaignId ?? 0}:${hash}`, sig);

  if (!isValid) return <Screen title="This link is invalid" />;

  const sub = await db.query.subscribers.findFirst({ where: eq(subscribers.hash, hash!) });
  if (!sub) return <Screen title="Subscription not found" />;

  if (sub.status === "unsubscribed") {
    return <Screen title="You've already unsubscribed" message="You won't receive any more emails from this list." />;
  }

  return (
    <Screen title={`Unsubscribe ${sub.email}?`}>
      <form action={unsubscribeAction} className="mt-6 space-y-4 text-left">
        <input type="hidden" name="hash" value={hash} />
        <input type="hidden" name="campaignId" value={campaignId ?? ""} />
        <input type="hidden" name="signature" value={sig} />
        <div className="space-y-1.5">
          <label htmlFor="reason" className="text-sm font-medium">Why are you leaving? (optional)</label>
          <Textarea id="reason" name="reason" rows={3} placeholder="Help us improve…" />
        </div>
        <Button type="submit" variant="destructive" className="w-full">Unsubscribe</Button>
      </form>
    </Screen>
  );
}

function Screen({ title, message, children }: { title: string; message?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
        {children}
      </div>
    </div>
  );
}
