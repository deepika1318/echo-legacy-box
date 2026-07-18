import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Heart, ShieldCheck, ShieldAlert, Loader2, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/legacy")({
  component: LegacyPage,
});

function LegacyPage() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [inactivityDays, setInactivityDays] = useState(90);
  const [memorialMessage, setMemorialMessage] = useState("");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["vault_settings"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase.from("vault_settings").select("*").eq("owner_id", u.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: familyVaults = [] } = useQuery({
    queryKey: ["accessible_vaults"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      // Family members can see rows where their email matches
      const { data: memberships } = await supabase.from("family_members").select("owner_id, relationship");
      if (!memberships) return [];
      const others = memberships.filter((m) => m.owner_id !== u.user.id);
      if (others.length === 0) return [];
      const ownerIds = others.map((m) => m.owner_id);
      const [{ data: profiles }, { data: vs }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", ownerIds),
        supabase.from("vault_settings").select("*").in("owner_id", ownerIds),
      ]);
      return others.map((m) => {
        const p = profiles?.find((x) => x.id === m.owner_id);
        const s = vs?.find((x) => x.owner_id === m.owner_id);
        const released = s?.is_released ||
          (s ? Date.now() - new Date(s.last_checkin_at).getTime() > (s.inactivity_days || 90) * 86400000 : false);
        return { owner_id: m.owner_id, name: p?.full_name || "A loved one", relationship: m.relationship, released, memorial: s?.memorial_message };
      });
    },
  });

  useEffect(() => {
    if (settings) {
      setInactivityDays(settings.inactivity_days);
      setMemorialMessage(settings.memorial_message || "");
    }
  }, [settings]);

  async function save() {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("vault_settings").update({
        inactivity_days: inactivityDays,
        memorial_message: memorialMessage.trim() || null,
      }).eq("owner_id", u.user.id);
      if (error) throw error;
      toast.success("Legacy settings saved");
      qc.invalidateQueries({ queryKey: ["vault_settings"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function checkIn() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("vault_settings").update({ last_checkin_at: new Date().toISOString() }).eq("owner_id", u.user.id);
    if (error) return toast.error(error.message);
    toast.success("Check-in recorded. Your vault stays private.");
    qc.invalidateQueries({ queryKey: ["vault_settings"] });
  }

  async function releaseNow() {
    if (!confirm("Release your vault to your family now? This cannot be undone from the app.")) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("vault_settings").update({ is_released: true, released_at: new Date().toISOString() }).eq("owner_id", u.user.id);
    if (error) return toast.error(error.message);
    toast.success("Your vault has been released to your family");
    qc.invalidateQueries({ queryKey: ["vault_settings"] });
  }

  const daysSinceCheckin = settings ? Math.floor((Date.now() - new Date(settings.last_checkin_at).getTime()) / 86400000) : 0;
  const isReleased = settings?.is_released || daysSinceCheckin > (settings?.inactivity_days ?? 90);

  if (isLoading) {
    return <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-serif text-4xl text-primary">Legacy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your vault stays private while you check in. When check-ins lapse — or when you choose —
          it opens to your family.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 text-primary">
            {isReleased ? <ShieldAlert className="size-5 text-gold" /> : <ShieldCheck className="size-5" />}
            <h2 className="font-serif text-xl">Status</h2>
          </div>
          <p className="mt-4 font-serif text-3xl text-primary">
            {isReleased ? "Released to family" : "Private"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {settings?.is_released
              ? `You released the vault on ${new Date(settings.released_at!).toLocaleDateString()}.`
              : `${daysSinceCheckin} ${daysSinceCheckin === 1 ? "day" : "days"} since last check-in • releases after ${settings?.inactivity_days} days`}
          </p>

          {!settings?.is_released && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                onClick={checkIn}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
              >
                <Heart className="size-4" /> Check in now
              </button>
              <button
                onClick={releaseNow}
                className="rounded-md border border-gold/40 bg-card px-4 py-2 text-sm text-primary hover:bg-accent"
              >
                Release now
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-soft)]">
          <h2 className="flex items-center gap-2 font-serif text-xl text-primary">
            <Clock className="size-5" /> Settings
          </h2>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Release after inactivity (days)
              </span>
              <input
                type="number"
                min={7}
                max={3650}
                value={inactivityDays}
                onChange={(e) => setInactivityDays(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                A message for your family
              </span>
              <textarea
                rows={4}
                value={memorialMessage}
                onChange={(e) => setMemorialMessage(e.target.value)}
                maxLength={2000}
                placeholder="Something to greet them with when they open the vault…"
                className="w-full rounded-md border border-input bg-background p-3 text-sm"
              />
            </label>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {saving && <Loader2 className="size-4 animate-spin" />} Save settings
            </button>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="font-serif text-2xl text-primary">Vaults you can access</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Vaults that have added your email as family. You'll only see contents once the vault is released.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {familyVaults.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card/40 py-10 text-center text-sm text-muted-foreground md:col-span-2">
              No family vaults linked to your email yet.
            </p>
          ) : (
            familyVaults.map((v) => (
              <Link
                key={v.owner_id}
                to="/memorial/$ownerId"
                params={{ ownerId: v.owner_id }}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-card p-4 shadow-[var(--shadow-soft)] transition hover:shadow-[var(--shadow-keepsake)]"
              >
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-full bg-accent text-sepia">
                    <User className="size-4" />
                  </div>
                  <div>
                    <p className="font-serif text-lg">{v.name}</p>
                    <p className="text-xs text-muted-foreground">{v.relationship || "Family vault"}</p>
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs ${v.released ? "bg-gold/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {v.released ? "Open" : "Sealed"}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
