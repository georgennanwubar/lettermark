/**
 * (public)/layout.tsx — Wrapper for unauthenticated pages: confirm, unsubscribe,
 * hosted subscribe forms, web-version archive. No sidebar, no global chrome.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40">
      {children}
    </div>
  );
}
