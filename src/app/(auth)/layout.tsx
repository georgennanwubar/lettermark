/**
 * (auth)/layout.tsx — Centered marketing-style layout for login & register.
 * Redirects authenticated users straight to /dashboard.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { Mail } from "lucide-react";
import { getAuth } from "@/lib/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (auth) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Mail className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">Postmark</span>
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        Self-hosted newsletter platform. Open source.
      </footer>
    </div>
  );
}
