import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, Video, FileText, Award, StickyNote, Mic, Loader2, Play, Download } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type ItemType = Database["public"]["Enums"]["item_type"];
type Item = Database["public"]["Tables"]["vault_items"]["Row"];

export const Route = createFileRoute("/_authenticated/memorial/$ownerId")({
  component: Memorial,
});

const ICON: Record<ItemType, React.ReactNode> = {
  photo: <Camera className="size-4" />, video: <Video className="size-4" />,
  file: <FileText className="size-4" />, certificate: <Award className="size-4" />,
  note: <StickyNote className="size-4" />, voice: <Mic className="size-4" />,
};

function Memorial() {
  const { ownerId } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["memorial", ownerId],
    queryFn: async () => {
      const [{ data: profile }, { data: settings }, { data: items }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", ownerId).maybeSingle(),
        supabase.from("vault_settings").select("*").eq("owner_id", ownerId).maybeSingle(),
        supabase.from("vault_items").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }),
      ]);
      return { profile, settings, items: (items as Item[]) || [] };
    },
  });

  if (isLoading) {
    return <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !data?.settings) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center">
        <p className="font-serif text-2xl text-primary">This vault isn't available</p>
        <p className="mt-2 text-sm text-muted-foreground">You may not be listed as family, or it hasn't been released yet.</p>
        <Link to="/legacy" className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Back to Legacy</Link>
      </div>
    );
  }

  const s = data.settings;
  const released = s.is_released || Date.now() - new Date(s.last_checkin_at).getTime() > s.inactivity_days * 86400000;

  return (
    <div>
      <Link to="/legacy" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back
      </Link>

      <div className="mb-10 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">In loving memory of</p>
        <h1 className="mt-2 font-serif text-5xl text-primary">{data.profile?.full_name || "A loved one"}</h1>
        {s.memorial_message && released && (
          <p className="mx-auto mt-6 max-w-xl text-pretty text-lg italic leading-relaxed text-muted-foreground">
            "{s.memorial_message}"
          </p>
        )}
      </div>

      {!released ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center">
          <p className="font-serif text-2xl text-primary">This vault is still sealed</p>
          <p className="mt-2 text-sm text-muted-foreground">The memories inside will be revealed when the owner releases them.</p>
        </div>
      ) : data.items.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">No memories were saved.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((item) => <MemorialCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}

function MemorialCard({ item }: { item: Item }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (item.storage_path) {
      supabase.storage.from("vault").createSignedUrl(item.storage_path, 3600).then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    }
    return () => { cancelled = true; };
  }, [item.storage_path]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-soft)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-parchment">
        {item.item_type === "photo" && url ? (
          <img src={url} alt={item.title} className="size-full object-cover" />
        ) : item.item_type === "video" && url ? (
          <video src={url} controls className="size-full object-cover" />
        ) : item.item_type === "voice" && url ? (
          <div className="grid size-full place-items-center p-6">
            <audio src={url} controls className="w-full" />
          </div>
        ) : (
          <div className="grid size-full place-items-center text-sepia/50">
            <div className="text-6xl">{ICON[item.item_type]}</div>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
          {ICON[item.item_type]} {item.item_type}
        </div>
        <h3 className="font-serif text-lg leading-tight">{item.title}</h3>
        {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
        {item.transcript && (
          <p className="mt-2 whitespace-pre-wrap rounded-md border-l-2 border-gold/40 bg-accent/40 p-2 text-sm italic text-muted-foreground">
            {item.transcript}
          </p>
        )}
        {url && (item.item_type === "file" || item.item_type === "certificate") && (
          <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline">
            <Download className="size-4" /> Open
          </a>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {new Date(item.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>
    </div>
  );
}
