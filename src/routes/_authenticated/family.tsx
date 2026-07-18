import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Trash2, Mail, Loader2 } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/family")({
  component: FamilyPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  fullName: z.string().trim().max(80).optional(),
  relationship: z.string().trim().max(60).optional(),
});

function FamilyPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["family_members"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase
        .from("family_members")
        .select("*")
        .eq("owner_id", u.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, fullName, relationship });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("family_members").insert({
        owner_id: u.user.id,
        family_email: email.trim().toLowerCase(),
        full_name: fullName.trim() || null,
        relationship: relationship.trim() || null,
      });
      if (error) throw error;
      toast.success(`${fullName || email} added to your family`);
      setEmail(""); setFullName(""); setRelationship("");
      qc.invalidateQueries({ queryKey: ["family_members"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Remove this family member from your vault?")) return;
    const { error } = await supabase.from("family_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["family_members"] });
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-serif text-4xl text-primary">Family</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The people who should inherit access. They'll need to create their own vault account
          using the exact email you enter here, then sign in to view yours once it's released.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <form onSubmit={invite} className="h-fit rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-soft)]">
          <h2 className="mb-4 flex items-center gap-2 font-serif text-xl text-primary">
            <Mail className="size-5" /> Invite by email
          </h2>
          <div className="space-y-3">
            <Field label="Email">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2" placeholder="daughter@example.com" />
            </Field>
            <Field label="Their name (optional)">
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2" placeholder="Sarah" />
            </Field>
            <Field label="Relationship (optional)">
              <input type="text" value={relationship} onChange={(e) => setRelationship(e.target.value)} maxLength={60}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2" placeholder="Daughter" />
            </Field>
            <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {busy && <Loader2 className="size-4 animate-spin" />} Add family member
            </button>
          </div>
          <p className="mt-4 rounded-md border-l-2 border-gold/40 bg-accent/40 p-3 text-xs text-muted-foreground">
            Family members will see your vault only after it's released — either you mark it released
            on the Legacy page, or your check-ins lapse past your chosen inactivity window.
          </p>
        </form>

        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-soft)]">
          <h2 className="mb-4 flex items-center gap-2 font-serif text-xl text-primary">
            <Users className="size-5" /> Your family ({members.length})
          </h2>
          {isLoading ? (
            <div className="grid place-items-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : members.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No family added yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{m.full_name || m.family_email}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.family_email}{m.relationship ? ` • ${m.relationship}` : ""}
                    </p>
                  </div>
                  <button onClick={() => remove(m.id)} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
