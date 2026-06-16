/**
 * (dashboard)/layout.tsx — Authenticated shell.
 *
 * Renders the desktop sidebar as a fixed flex column, and the mobile
 * trigger inside a sticky top header. Sidebar handles its own internals.
 */
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { Sidebar, MobileSidebar } from "@/components/layout/sidebar";
import { Mail } from "lucide-react";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");

  const props = {
    user: { id: String(auth.user.id), email: auth.user.email, name: auth.user.name ?? "" },
    account: { id: String(auth.account.id), name: auth.account.name },
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar {...props} />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
          <MobileSidebar {...props} />
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Mail className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold tracking-tight">Postmark</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
