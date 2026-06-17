/**
 * /profile — Subscriber-facing preferences page.
 *
 * Linked from the {profile} merge tag / footer-with-unsubscribe snippet.
 * Payload signed is just the subscriber hash (see lib/email/tracking.ts).
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscribers } from "@/lib/db/schema";
import { verifyTracking, unsubscribeUrl } from "@/lib/email/tracking";
import { updateProfileAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ s?: string; t?: string; saved?: string }>;
}

export default async function ProfilePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const hash = sp.s;
  const sig = sp.t;

  const isValid = !!hash && !!sig && verifyTracking(hash, sig);
  if (!isValid) return <Screen title="This link is invalid" />;

  const sub = await db.query.subscribers.findFirst({ where: eq(subscribers.hash, hash!) });
  if (!sub) return <Screen title="Subscription not found" />;

  return (
    <Screen title="Update your preferences">
      {sp.saved && (
        <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">
          Saved.
        </p>
      )}
      <form action={updateProfileAction} className="space-y-4 text-left">
        <input type="hidden" name="hash" value={hash} />
        <input type="hidden" name="signature" value={sig} />
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={sub.email} disabled />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" name="firstName" defaultValue={sub.firstName ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" name="lastName" defaultValue={sub.lastName ?? ""} />
          </div>
        </div>
        <Button type="submit" className="w-full">Save preferences</Button>
      </form>
      <a
        href={unsubscribeUrl(null, sub.hash)}
        className="mt-6 inline-block text-sm text-muted-foreground underline"
      >
        Unsubscribe from all emails
      </a>
    </Screen>
  );
}

function Screen({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}
