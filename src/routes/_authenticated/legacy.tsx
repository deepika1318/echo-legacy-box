import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Clock, Heart, ShieldCheck, ShieldAlert, Loader2, User, UserCheck,
  FileCheck, FileX, Trash2, Plus,
} from "lucide-react";
import { z } from "zod";
import { reviewCertificate } from "@/lib/vault.functions";

export const Route = createFileRoute("/_authenticated/legacy")({
  component: LegacyPage,
});

const contactSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  fullName: z.string().trim().max(80).optional(),
  relationship: z.string().trim().max(60).optional(),
});

function LegacyPage() {
  const qc = useQueryClient();
  const review = useServerFn(reviewCertificate);
  const [saving, setSaving] = useState(false);
  const [inactivityDays, setInactivityDays] = useState(90);
  const [requiredApprovals, setRequiredApprovals] = useState(1);
  const [memorialMessage, setMemorialMessage] = useState("");

  // trusted contact form
  const [tcEmail, setTcEmail] = useState("");
  const [tcName, setTcName] = useState("");
  const [tcRelationship, setTcRelationship] = useState("");
  const [tcBusy, setTcBusy] = useState(false);

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

  const { data: contacts = [] } = useQuery({
    queryKey: ["trusted_contacts"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase.from("trusted_contacts").select("*").eq("owner_id", u.user.id);
      if (error) throw error;
      return data;
    },
  });

  const { data: approvals = [] } = useQuery({
    queryKey: ["release_approvals"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase.from("release_approvals").select("*").eq("owner_id", u.user.id);
      if (error) throw error;
      return data;
    },
  });

  const { data: certs = [] } = useQuery({
    queryKey: ["death_certificates_owner"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase
        .from("death_certificates")
        .select("*")
        .eq("owner_id", u.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: familyVaults = [] } = useQuery({
    queryKey: ["accessible_vaults"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
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
      setRequiredApprovals(settings.required_approvals ?? 1);
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
        required_approvals: Math.max(1, requiredApprovals),
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

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    const parsed = contactSchema.safeParse({ email: tcEmail, fullName: tcName, relationship: tcRelationship });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setTcBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("trusted_contacts").insert({
        owner_id: u.user.id,
        contact_email: tcEmail.trim().toLowerCase(),
        full_name: tcName.trim() || null,
        relationship: tcRelationship.trim() || null,
      });
      if (error) throw error;
      toast.success("Trusted contact added");
      setTcEmail(""); setTcName(""); setTcRelationship("");
      qc.invalidateQueries({ queryKey: ["trusted_contacts"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setTcBusy(false); }
  }

  async function removeContact(id: string) {
    if (!confirm("Remove this trusted contact?")) return;
    const { error } = await supabase.from("trusted_contacts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["trusted_contacts"] });
  }

  async function decide(certId: string, decision: "approved" | "rejected") {
    try {
      await review({ data: { certId, decision } });
      toast.success(`Certificate ${decision}`);
      qc.invalidateQueries({ queryKey: ["death_certificates_owner"] });
      qc.invalidateQueries({ queryKey: ["vault_settings"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function viewCert(path: string) {
    const { data, error } = await supabase.storage.from("vault").createSignedUrl(path, 300);
    if (error || !data) return toast.error(error?.message || "Cannot open");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const daysSinceCheckin = settings ? Math.floor((Date.now() - new Date(settings.last_checkin_at).getTime()) / 86400000) : 0;
  const inactivityMet = daysSinceCheckin > (settings?.inactivity_days ?? 90);
  const quorumMet = approvals.length >= (settings?.required_approvals ?? 1);
  const anyCertApproved = certs.some((c) => c.status === "approved");
  const isReleased = settings?.is_released || (inactivityMet && quorumMet) || anyCertApproved;

  if (isLoading) {
    return <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-serif text-4xl text-primary">Legacy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your vault stays private until you release it, until check-ins lapse with enough
          trusted-contact vouches, or until a submitted death certificate is approved.
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
          <p className="mt-1 text-xs text-muted-foreground">
            Vouches: {approvals.length}/{settings?.required_approvals ?? 1} • Certificates approved: {certs.filter((c) => c.status === "approved").length}
          </p>

          {!settings?.is_released && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button onClick={checkIn} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90">
                <Heart className="size-4" /> Check in now
              </button>
              <button onClick={releaseNow} className="rounded-md border border-gold/40 bg-card px-4 py-2 text-sm text-primary hover:bg-accent">
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
              <input type="number" min={7} max={3650} value={inactivityDays} onChange={(e) => setInactivityDays(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Trusted-contact vouches required (quorum)
              </span>
              <input type="number" min={1} max={10} value={requiredApprovals} onChange={(e) => setRequiredApprovals(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                A message for your family
              </span>
              <textarea rows={3} value={memorialMessage} onChange={(e) => setMemorialMessage(e.target.value)} maxLength={2000}
                placeholder="Something to greet them with when they open the vault…"
                className="w-full rounded-md border border-input bg-background p-3 text-sm" />
            </label>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {saving && <Loader2 className="size-4 animate-spin" />} Save settings
            </button>
          </div>
        </div>
      </div>

      {/* Trusted contacts */}
      <section className="mt-10 rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-soft)]">
        <h2 className="flex items-center gap-2 font-serif text-2xl text-primary">
          <UserCheck className="size-5" /> Trusted contacts
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          People allowed to vouch that it's time to release your vault. Vouches count toward the quorum above.
        </p>

        <form onSubmit={addContact} className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
          <input type="email" required value={tcEmail} onChange={(e) => setTcEmail(e.target.value)} placeholder="Email" maxLength={255}
            className="rounded-md border border-input bg-background px-3 py-2.5 text-sm" />
          <input type="text" value={tcName} onChange={(e) => setTcName(e.target.value)} placeholder="Name (optional)" maxLength={80}
            className="rounded-md border border-input bg-background px-3 py-2.5 text-sm" />
          <input type="text" value={tcRelationship} onChange={(e) => setTcRelationship(e.target.value)} placeholder="Relationship (optional)" maxLength={60}
            className="rounded-md border border-input bg-background px-3 py-2.5 text-sm" />
          <button disabled={tcBusy} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60">
            <Plus className="size-4" /> Add
          </button>
        </form>

        <ul className="mt-4 divide-y divide-border/60">
          {contacts.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No trusted contacts yet.</li>}
          {contacts.map((c) => {
            const hasVouched = approvals.some((a) => a.contact_email.toLowerCase() === c.contact_email.toLowerCase());
            return (
              <li key={c.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{c.full_name || c.contact_email}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.contact_email}{c.relationship ? ` • ${c.relationship}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {hasVouched && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-xs text-primary">
                      <UserCheck className="size-3" /> Vouched
                    </span>
                  )}
                  <button onClick={() => removeContact(c.id)} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Certificates for review */}
      <section className="mt-8 rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-soft)]">
        <h2 className="flex items-center gap-2 font-serif text-2xl text-primary">
          <FileCheck className="size-5" /> Certificate submissions
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Documents uploaded by family or trusted contacts. Approving one releases your vault.
        </p>
        <ul className="mt-4 divide-y divide-border/60">
          {certs.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No submissions.</li>}
          {certs.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{c.uploader_email}</p>
                <p className="text-xs text-muted-foreground">
                  Submitted {new Date(c.created_at).toLocaleString()}
                  {c.notes ? ` • ${c.notes}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs ${
                  c.status === "approved" ? "bg-gold/15 text-primary"
                  : c.status === "rejected" ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
                }`}>{c.status}</span>
                <button onClick={() => viewCert(c.storage_path)} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent">
                  View
                </button>
                {c.status === "pending" && (
                  <>
                    <button onClick={() => decide(c.id, "approved")} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90">
                      <FileCheck className="size-3.5" /> Approve
                    </button>
                    <button onClick={() => decide(c.id, "rejected")} className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10">
                      <FileX className="size-3.5" /> Reject
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

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
              <Link key={v.owner_id} to="/memorial/$ownerId" params={{ ownerId: v.owner_id }}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-card p-4 shadow-[var(--shadow-soft)] transition hover:shadow-[var(--shadow-keepsake)]">
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
