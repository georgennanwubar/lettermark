/**
 * sidebar.tsx — Application chrome.
 *
 * Exports two components:
 *   - <Sidebar> — desktop column, hidden on mobile.
 *   - <MobileSidebar> — hamburger button + slide-out sheet, hidden on desktop.
 *
 * Splitting them lets the dashboard layout place each in the right place
 * (desktop sidebar as a flex column; mobile trigger inside a fixed header).
 *
 * Active route is determined client-side from usePathname so the link state
 * updates immediately on navigation without a full reload.
 */
"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Send,
  Users,
  ListChecks,
  Tag,
  Workflow,
  FileText,
  BarChart3,
  Settings,
  Mail,
  MailPlus,
  Menu,
  LogOut,
  ChevronDown,
  Sun,
  Moon,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { logoutAction } from "@/lib/auth/actions";

interface SidebarUser { id: string; email: string; name: string }
interface SidebarAccount { id: string; name: string }
interface SidebarProps { user: SidebarUser; account: SidebarAccount }

const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/campaigns", label: "Campaigns", icon: Send },
      { href: "/automations", label: "Automations", icon: Workflow },
    ],
  },
  {
    label: "Audience",
    items: [
      { href: "/subscribers", label: "Subscribers", icon: Users },
      { href: "/lists", label: "Lists", icon: ListChecks },
      { href: "/tags", label: "Tags", icon: Tag },
      { href: "/forms", label: "Forms", icon: MailPlus },
    ],
  },
  {
    label: "Library",
    items: [
      { href: "/templates", label: "Templates", icon: FileText },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
];

function NavLink({ href, icon: Icon, label, active, onClick }: { href: string; icon: React.ElementType; label: string; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
      <span>{label}</span>
    </Link>
  );
}

function NavInner({ user, account, onNavigate }: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Mail className="h-4 w-4" />
        </div>
        <span className="font-semibold tracking-tight">Postmark</span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <div className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  active={isActive(item.href)}
                  onClick={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-secondary/60">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold uppercase text-primary">
                {user.name?.slice(0, 2) || user.email.slice(0, 2)}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium">{user.name || user.email}</div>
                <div className="truncate text-xs text-muted-foreground">{account.name}</div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{user.name || user.email}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings"><Settings className="mr-2 h-4 w-4" />Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => {
              const html = document.documentElement;
              const isDark = html.classList.toggle("dark");
              localStorage.setItem("theme", isDark ? "dark" : "light");
            }}>
              <Sun className="mr-2 h-4 w-4 dark:hidden" />
              <Moon className="mr-2 hidden h-4 w-4 dark:block" />
              Toggle theme
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive asChild>
              <form action={logoutAction}>
                <button type="submit" className="flex w-full items-center">
                  <LogOut className="mr-2 h-4 w-4" />Sign out
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** Desktop sidebar: 240px fixed column, hidden on small screens. */
export function Sidebar(props: SidebarProps) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
      <NavInner {...props} />
    </aside>
  );
}

/** Mobile sidebar trigger + sheet. Hidden on desktop. */
export function MobileSidebar(props: SidebarProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden -ml-2">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open navigation</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="left-0 top-0 h-screen max-h-screen w-72 translate-x-0 translate-y-0 rounded-none p-0 sm:rounded-none">
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <NavInner {...props} onNavigate={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
