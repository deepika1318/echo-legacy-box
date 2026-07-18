import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Vault, Users, Clock, LogOut, Heart } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const router = useRouter();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/vault" className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-full bg-[var(--gradient-gold)] text-gold-foreground shadow-[var(--shadow-soft)]">
              <Heart className="size-4" strokeWidth={2.25} />
            </div>
            <span className="font-serif text-xl tracking-tight">AI Digital Vault</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink to="/vault" icon={<Vault className="size-4" />} label="Vault" />
            <NavLink to="/family" icon={<Users className="size-4" />} label="Family" />
            <NavLink to="/legacy" icon={<Clock className="size-4" />} label="Legacy" />
          </nav>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 px-4 pb-3 md:hidden">
          <NavLink to="/vault" icon={<Vault className="size-4" />} label="Vault" />
          <NavLink to="/family" icon={<Users className="size-4" />} label="Family" />
          <NavLink to="/legacy" icon={<Clock className="size-4" />} label="Legacy" />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
      activeProps={{ className: "bg-accent text-foreground" }}
    >
      {icon} {label}
    </Link>
  );
}
