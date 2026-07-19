import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCheck, FileUp, ShieldCheck, Loader2, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/verify")({
  component: VerifyPage,
});

type LinkedVault = {
  owner_id: string;
  name: string;
  role: "family" | "trusted";
  quorum: number;
  vouched: boolean;
  vouchCount: number;
};

function VerifyPage() {
  const qc = useQueryClient();

  const { data: vaults = [], isLoading } = useQuery({
    queryKey: ["verify_vaults"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const email = u.user?.email?.toLowerCase();
      if (!u.user || !email) return [] as LinkedVault[];

      const [{ data: fam }, { data: trusted }] = await Promise.all([
        supabase.from("family_members").select("owner_id"),
        supabase.from("trusted_contacts").select("owner_id"),
      ]);
      const famIds = new Set((fam ?? []).map((r) => r.owner_id));
      const trustedIds = new Set((trusted ?? []).map((r) => r.owner_id));
      const allIds = Array.from(new Set([...famIds, ...trustedIds])).filter((id) => id !== u.user!.id);
      if (allIds.length === 0) return [];

      const [{ data: profiles }, { data: settings }, { data: approvals }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", allIds),
        supabase.from("vault_settings").select("owner_id, required_approvals").in("owner_id", allIds),
        supabase.from("release_approvals").select("owner_id, contact_email").in("owner_id", allIds),
      ]);

      return allIds.map((id) => {
        const role: "family" | "trusted" = trustedIds.has(id) ? "trusted" : "family";
        const vouches = (approvals ?? []).filter((a) => a.owner_id === id);
        return {
          owner_id: id,
          name: profiles?.find((p) => p.id === id)?.full_name || "A loved one",
          role,
          quorum: settings?.find((s) => s.owner_id === id)?.required_approvals ?? 1,
          vouched: vouches.some((v) => v.contact_email.toLowerCase() === email),
          vouchCount: vouches.length,
        };
      });
    },
  });

  async function vouch(ownerId: string) {
    const { data: u } = await supabase.auth.getUser();
    const email = u.user?.email?.toLowerCase();
    if (!email) return toast.error("Sign in required");
    const { error } = await supabase.from("release_approvals").insert({
      owner_id: ownerId,
      contact_email: email,
    });
    if (error) return toast.error(error.message);
    toast.success("Vouch recorded");
    qc.invalidateQueries({ queryKey: ["verify_vaults"] });
  }

  async function uploadCert(ownerId: string, file: File) {
    const { data: u } = await supabase.auth.getUser();
    const email = u.user?.email?.toLowerCase();
    if (!email) return toast.error("Sign in required");
    try {
      const path = `certificates/${ownerId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("vault").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("death_certificates").insert({
        owner_id: ownerId,
        uploader_email: email,
        storage_path: path,
        notes: `Uploaded ${file.name}`,
      });
      if (insErr) throw insErr;
      toast.success("Certificate submitted. The vault owner will review it.");
      qc.invalidateQueries({ queryKey: ["verify_vaults"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  if (isLoading) {
    return <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-serif text-4xl text-primary">Verify a legacy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          If you're listed as family or a trusted contact for someone, you can vouch that it's time
          for their vault to open, or upload a death certificate for the owner to review.
        </p>
      </div>

      {vaults.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card/40 py-16 text-center text-sm text-muted-foreground">
          Nothing to verify. Ask your loved one to add your email to their family or trusted contacts list.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {vaults.map((v) => (
            <VaultCard key={v.owner_id} vault={v} onVouch={() => vouch(v.owner_id)} onUpload={(f) => uploadCert(v.owner_id, f)} />
          ))}
        </div>
      )}
    </div>
  );
}

function VaultCard({
  vault, onVouch, onUpload,
}: { vault: LinkedVault; onVouch: () => void; onUpload: (f: File) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-full bg-accent text-sepia">
          <User className="size-4" />
        </div>
        <div>
          <p className="font-serif text-xl text-primary">{vault.name}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {vault.role === "trusted" ? "Trusted contact" : "Family member"}
          </p>
        </div>
      </div>

      {vault.role === "trusted" && (
        <div className="mt-4 rounded-md border border-border bg-background p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Vouch quorum</p>
            <p className="text-xs text-muted-foreground">{vault.vouchCount}/{vault.quorum} recorded</p>
          </div>
          <button
            onClick={onVouch}
            disabled={vault.vouched}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {vault.vouched ? <ShieldCheck className="size-4" /> : <UserCheck className="size-4" />}
            {vault.vouched ? "You've vouched" : "Vouch it's time"}
          </button>
        </div>
      )}

      <div className="mt-4 rounded-md border border-border bg-background p-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Death certificate</p>
        <label className="mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground hover:border-gold">
          <FileUp className="size-5" />
          {file ? file.name : "Choose PDF or image"}
          <input type="file" accept=".pdf,image/*" className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button
          disabled={!file || uploading}
          onClick={async () => {
            if (!file) return;
            setUploading(true);
            await onUpload(file);
            setFile(null);
            setUploading(false);
          }}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent disabled:opacity-60"
        >
          {uploading && <Loader2 className="size-4 animate-spin" />} Submit for review
        </button>
      </div>
    </div>
  );
}
