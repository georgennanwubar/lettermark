export default function UnsubscribeDonePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-xl text-emerald-700 ring-1 ring-emerald-200">✓</div>
        <h1 className="text-xl font-semibold">You&apos;re unsubscribed</h1>
        <p className="mt-2 text-sm text-muted-foreground">You won&apos;t receive any more emails from this list.</p>
      </div>
    </div>
  );
}
