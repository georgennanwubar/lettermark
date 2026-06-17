import { redirect } from "next/navigation";
import Link from "next/link";
import { LettermarkIcon } from "@/components/ui/lettermark-icon";
import { getAuth } from "@/lib/auth/session";

function CloudMotif({ style }: { style: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 200 120"
      width="200"
      style={{ position: "absolute", pointerEvents: "none", ...style }}
      fill="none"
      stroke="hsl(var(--primary)/0.12)"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M40 90 a28 28 0 0 1 4 -55 a34 34 0 0 1 64 -6 a26 26 0 0 1 34 26 a24 24 0 0 1 -6 35 Z" />
    </svg>
  );
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (auth) redirect("/dashboard");

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Faint cloud motifs on the Cloud canvas */}
      <CloudMotif style={{ top: 80,  left: 60 }} />
      <CloudMotif style={{ top: 360, left: 120, transform: "scale(0.8)" }} />
      <CloudMotif style={{ top: 140, right: 80 }} />
      <CloudMotif style={{ bottom: 80, right: 180, transform: "scale(1.1)" }} />

      {/* Main content */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-12">
        {/* Large brand lockup */}
        <Link href="/" className="mb-8 flex items-center gap-3.5">
          <LettermarkIcon size={44} />
          <span
            className="text-[38px] font-bold leading-none tracking-tight text-foreground"
            style={{ letterSpacing: "-0.02em" }}
          >
            Lettermark
          </span>
        </Link>

        {/* Auth card */}
        <div className="w-full max-w-[420px] rounded-xl border border-border bg-card p-7 shadow-md">
          {children}
        </div>
      </div>

      <footer className="relative border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        Self-hosted newsletter platform. Open source.
      </footer>
    </div>
  );
}
