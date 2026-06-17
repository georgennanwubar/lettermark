import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { Sidebar, MobileSidebar } from "@/components/layout/sidebar";
import { LettermarkIcon } from "@/components/ui/lettermark-icon";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");

  const props = {
    user:    { id: String(auth.user.id), email: auth.user.email, name: auth.user.name ?? "" },
    account: { id: String(auth.account.id), name: auth.account.name },
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar {...props} />
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Mobile-only sticky header */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:hidden">
          <MobileSidebar {...props} />
          <div className="flex items-center gap-2.5">
            <LettermarkIcon size={28} />
            <span className="text-[15px] font-semibold tracking-tight">Lettermark</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
