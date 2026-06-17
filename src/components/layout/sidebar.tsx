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
  MailPlus,
  Menu,
  LogOut,
  ChevronDown,
  Sun,
  Moon,
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
import { LettermarkIcon } from "@/components/ui/lettermark-icon";
import { logoutAction } from "@/lib/auth/actions";

interface SidebarUser { id: string; email: string; name: string }
interface SidebarAccount { id: string; name: string }
interface SidebarProps { user: SidebarUser; account: SidebarAccount }

const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
      { href: "/campaigns",   label: "Campaigns",   icon: Send },
      { href: "/automations", label: "Automations", icon: Workflow },
    ],
  },
  {
    label: "Audience",
    items: [
      { href: "/subscribers", label: "Subscribers", icon: Users },
      { href: "/lists",       label: "Lists",       icon: ListChecks },
      { href: "/tags",        label: "Tags",        icon: Tag },
      { href: "/forms",       label: "Forms",       icon: MailPlus },
    ],
  },
  {
    label: "Library",
    items: [
      { href: "/templates",  label: "Templates",  icon: FileText },
      { href: "/analytics",  label: "Analytics",  icon: BarChart3 },
    ],
  },
];

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-primary/[0.22] text-white"
          : "text-white/70 hover:bg-white/[0.06] hover:text-white",
      )}
      style={active ? { boxShadow: "inset 2px 0 0 hsl(var(--primary))" } : undefined}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active
            ? "text-primary"
            : "text-white/40 group-hover:text-white/70",
        )}
      />
      <span>{label}</span>
    </Link>
  );
}

function NavInner({
  user,
  account,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--c-sidebar)" }}
    >
      {/* Brand lockup */}
      <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-4">
        <LettermarkIcon size={30} />
        <span className="text-[15px] font-semibold tracking-tight text-white">
          Lettermark
        </span>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-0.5">
            <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-[#5C6080]">
              {group.label}
            </div>
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
        ))}
      </nav>

      {/* User menu */}
      <div className="border-t border-white/10 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-white/[0.06]">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold uppercase text-white">
                {user.name?.slice(0, 2) || user.email.slice(0, 2)}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium text-white">
                  {user.name || user.email}
                </div>
                <div className="truncate text-xs text-white/50">{account.name}</div>
              </div>
              <ChevronDown className="h-4 w-4 text-white/40" />
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
              <Link href="/settings">
                <Settings className="mr-2 h-4 w-4" />Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const html = document.documentElement;
                const isDark = html.classList.toggle("dark");
                localStorage.setItem("theme", isDark ? "dark" : "light");
              }}
            >
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

/** Desktop sidebar — 240px fixed column, hidden on mobile. */
export function Sidebar(props: SidebarProps) {
  return (
    <aside
      className="hidden w-60 shrink-0 flex-col md:flex"
      style={{
        backgroundColor: "var(--c-sidebar)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <NavInner {...props} />
    </aside>
  );
}

/** Mobile sidebar trigger + slide-out sheet. Hidden on desktop. */
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
