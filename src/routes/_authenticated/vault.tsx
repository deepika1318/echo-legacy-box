import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Camera, Video, FileText, Award, StickyNote, Mic, Upload, Trash2, Plus,
  Loader2, Play, Download, X, Languages, Pencil, Check, Search, Sparkles,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { embedItems, searchMemories } from "@/lib/search.functions";

type ItemType = Database["public"]["Enums"]["item_type"];
type Item = Database["public"]["Tables"]["vault_items"]["Row"];

export const Route = createFileRoute("/_authenticated/vault")({
  component: VaultPage,
});

const TYPE_META: Record<ItemType, { label: string; icon: React.ReactNode; accept?: string }> = {
  photo: { label: "Photos", icon: <Camera className="size-4" />, accept: "image/*" },
  video: { label: "Videos", icon: <Video className="size-4" />, accept: "video/*" },
  file: { label: "Files", icon: <FileText className="size-4" />, accept: "*/*" },
  certificate: { label: "Certificates", icon: <Award className="size-4" />, accept: ".pdf,image/*" },
  note: { label: "Notes", icon: <StickyNote className="size-4" /> },
  voice: { label: "Voice notes", icon: <Mic className="size-4" /> },
};

const TRANSCRIBE_LANGUAGES: { code: string; label: string }[] = [
  { code: "", label: "Auto-detect" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "ru", label: "Russian" },
  { code: "tr", label: "Turkish" },
];

function VaultPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ItemType | "all">("all");
  const [uploadOpen, setUploadOpen] = useState<null | ItemType>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [matches, setMatches] = useState<{ id: string; similarity: number }[] | null>(null);
  const search = useServerFn(searchMemories);
  const reindex = useServerFn(embedItems);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["vault_items"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase
        .from("vault_items")
        .select("*")
        .eq("owner_id", u.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  const filtered = useMemo(() => {
    if (matches) {
      const byId = new Map(items.map((i) => [i.id, i]));
      return matches.map((m) => byId.get(m.id)).filter(Boolean) as Item[];
    }
    return filter === "all" ? items : items.filter((i) => i.item_type === filter);
  }, [items, filter, matches]);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) { setMatches(null); return; }
    setSearching(true);
    try {
      const { matches: m } = await search({ data: { query: q } });
      setMatches(m);
      if (m.length === 0) toast.info("No memories matched — try different words.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setQuery("");
    setMatches(null);
  }

  async function reindexAll() {
    setReindexing(true);
    try {
      const { embedded } = await reindex({ data: {} });
      toast.success(embedded ? `Indexed ${embedded} memories` : "Everything is already indexed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reindex failed");
    } finally {
      setReindexing(false);
    }
  }

  async function del(item: Item) {
    if (!confirm(`Remove "${item.title}" from your vault?`)) return;
    if (item.storage_path) await supabase.storage.from("vault").remove([item.storage_path]);
    const { error } = await supabase.from("vault_items").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["vault_items"] });
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl text-primary">Your Vault</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? "memory" : "memories"} preserved
          </p>
        </div>
        <button
          onClick={reindexAll}
          disabled={reindexing}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
          title="Generate AI embeddings for any memories not yet indexed"
        >
          {reindexing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          Reindex for AI search
        </button>
      </div>

      <form onSubmit={runSearch} className="mb-6">
        <div className="relative flex items-center rounded-xl border border-border bg-card shadow-[var(--shadow-soft)] focus-within:border-gold">
          <Sparkles className="pointer-events-none absolute left-3 size-4 text-gold" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Ask your vault — e.g. "graduation photos" or "grandma's recipe"`}
            className="w-full bg-transparent py-3 pl-10 pr-32 text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <div className="absolute right-2 flex items-center gap-1">
            {matches && (
              <button type="button" onClick={clearSearch} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" title="Clear">
                <X className="size-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-60"
            >
              {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
              Search
            </button>
          </div>
        </div>
        {matches && (
          <p className="mt-2 text-xs text-muted-foreground">
            {matches.length === 0 ? "No matches found." : `Found ${matches.length} matching ${matches.length === 1 ? "memory" : "memories"}, ranked by relevance.`}
          </p>
        )}
      </form>

      {!matches && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </Chip>
          {(Object.keys(TYPE_META) as ItemType[]).map((t) => (
            <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>
              {TYPE_META[t].icon} {TYPE_META[t].label}
            </Chip>
          ))}
        </div>
      )}

      <div className="mb-8 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        {(Object.keys(TYPE_META) as ItemType[]).map((t) => (
          <button
            key={t}
            onClick={() => setUploadOpen(t)}
            className="group flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-3 py-4 text-sm text-muted-foreground transition hover:border-gold hover:bg-card hover:text-foreground"
          >
            <div className="grid size-10 place-items-center rounded-full bg-accent text-sepia transition group-hover:bg-gold group-hover:text-gold-foreground">
              <Plus className="size-4" />
            </div>
            <span className="flex items-center gap-1.5">{TYPE_META[t].icon} {TYPE_META[t].label}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center">
          <p className="font-serif text-2xl text-primary">{matches ? "No memories matched" : "Nothing here yet"}</p>
          <p className="mt-2 text-sm text-muted-foreground">{matches ? "Try different words or clear the search." : "Add your first memory above."}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} onDelete={() => del(item)} />
          ))}
        </div>
      )}


      {uploadOpen && (
        <UploadDialog
          type={uploadOpen}
          onClose={() => setUploadOpen(null)}
          onDone={() => {
            setUploadOpen(null);
            qc.invalidateQueries({ queryKey: ["vault_items"] });
          }}
        />
      )}

      <div className="mt-16 rounded-2xl border border-border/60 bg-card p-6">
        <h3 className="font-serif text-xl text-primary">Access</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Your vault is private. Manage who inherits access on the{" "}
          <Link to="/family" className="font-medium text-primary underline-offset-2 hover:underline">
            Family
          </Link>{" "}
          page, and set your check-in rhythm on the{" "}
          <Link to="/legacy" className="font-medium text-primary underline-offset-2 hover:underline">
            Legacy
          </Link>{" "}
          page.
        </p>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ItemCard({ item, onDelete }: { item: Item; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [viewer, setViewer] = useState(false);
  const meta = TYPE_META[item.item_type];

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
    <>
      <div className="group overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-soft)] transition hover:shadow-[var(--shadow-keepsake)]">
        <div className="relative aspect-[4/3] overflow-hidden bg-parchment">
          {item.item_type === "photo" && url ? (
            <img src={url} alt={item.title} className="size-full object-cover" />
          ) : item.item_type === "video" && url ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={url} className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-sepia/50">
              <div className="text-6xl">{meta.icon}</div>
            </div>
          )}
          <div className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">
            {meta.label.slice(0, -1)}
          </div>
        </div>
        <div className="p-4">
          <h3 className="font-serif text-lg leading-tight">{item.title}</h3>
          {item.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
          )}
          {item.transcript && (
            <p className="mt-2 line-clamp-3 rounded-md border-l-2 border-gold/40 bg-accent/40 p-2 text-xs italic text-muted-foreground">
              "{item.transcript}"
            </p>
          )}
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{new Date(item.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
            <div className="flex gap-1">
              {(url || item.item_type === "voice" || item.item_type === "note") && (
                <button onClick={() => setViewer(true)} className="rounded-md p-1.5 hover:bg-accent" title="Open">
                  {item.item_type === "video" || item.item_type === "voice" ? <Play className="size-4" /> : item.item_type === "note" ? <Pencil className="size-4" /> : <Download className="size-4" />}
                </button>
              )}
              <button onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remove">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewer && (
        <Viewer item={item} url={url ?? ""} onClose={() => setViewer(false)} />
      )}
    </>
  );
}

function Viewer({ item, url, onClose }: { item: Item; url: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.transcript ?? "");
  const [saving, setSaving] = useState(false);
  const hasAudio = item.item_type === "voice" && !!item.storage_path;

  const reembed = useServerFn(embedItems);
  async function saveTranscript() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("vault_items")
        .update({ transcript: draft.trim() || null })
        .eq("id", item.id);
      if (error) throw error;
      reembed({ data: { itemId: item.id } }).catch(() => {});
      toast.success("Transcript updated");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["vault_items"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1.5 hover:bg-accent"><X className="size-4" /></button>
        <h2 className="font-serif text-2xl">{item.title}</h2>
        {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
        <div className="mt-4">
          {item.item_type === "photo" && <img src={url} alt={item.title} className="mx-auto max-h-[60vh] rounded-lg" />}
          {item.item_type === "video" && <video src={url} controls className="mx-auto max-h-[60vh] w-full rounded-lg" />}
          {hasAudio && <audio src={url} controls className="mx-auto w-full" />}
          {(item.item_type === "file" || item.item_type === "certificate") && (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
              <Download className="size-4" /> Download {item.title}
            </a>
          )}
          {item.item_type === "voice" && !hasAudio && (
            <p className="text-center text-sm italic text-muted-foreground">Raw audio was not kept — transcript only.</p>
          )}
        </div>
        <div className="mt-6 rounded-lg border border-border bg-background p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {item.item_type === "note" ? "Note" : "Transcript"}
            </p>
            {!editing ? (
              <button onClick={() => { setDraft(item.transcript ?? ""); setEditing(true); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent">
                <Pencil className="size-3" /> Edit
              </button>
            ) : (
              <div className="flex gap-1">
                <button onClick={() => setEditing(false)} className="rounded-md px-2 py-1 text-xs hover:bg-accent">Cancel</button>
                <button onClick={saveTranscript} disabled={saving} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-60">
                  {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Save
                </button>
              </div>
            )}
          </div>
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-input bg-card p-2 text-sm outline-none ring-ring focus:ring-2"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm">{item.transcript || <span className="italic text-muted-foreground">No transcript.</span>}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadDialog({
  type, onClose, onDone,
}: { type: ItemType; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [keepAudio, setKeepAudio] = useState(true);
  const meta = TYPE_META[type];
  const embedOne = useServerFn(embedItems);

  async function save() {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      let storage_path: string | null = null;
      let mime_type: string | null = null;
      let size_bytes: number | null = null;
      let transcript: string | null = null;

      if (type === "note") {
        if (!noteBody.trim()) throw new Error("Please write your note");
        transcript = noteBody.trim();
      } else if (type === "voice") {
        transcript = noteBody.trim() || null;
        if (!file && !transcript) throw new Error("Record something or add a transcript");
        if (file && keepAudio) {
          const path = `${u.user.id}/${type}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
          const { error: upErr } = await supabase.storage.from("vault").upload(path, file, { upsert: false });
          if (upErr) throw upErr;
          storage_path = path;
          mime_type = file.type;
          size_bytes = file.size;
        }
      } else {
        if (!file) throw new Error("Please choose a file");
        const path = `${u.user.id}/${type}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("vault").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        storage_path = path;
        mime_type = file.type;
        size_bytes = file.size;
      }

      const { data: inserted, error } = await supabase.from("vault_items").insert({
        owner_id: u.user.id,
        item_type: type,
        title: title.trim() || file?.name || "Untitled",
        description: description.trim() || null,
        storage_path,
        mime_type,
        size_bytes,
        transcript,
      }).select("id").single();
      if (error) throw error;
      if (inserted?.id) embedOne({ data: { itemId: inserted.id } }).catch(() => {});
      toast.success("Saved to your vault");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-[var(--shadow-keepsake)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-serif text-2xl text-primary">{meta.icon} Add {meta.label.toLowerCase().slice(0, -1)}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-accent"><X className="size-4" /></button>
        </div>

        {type === "voice" ? (
          <VoiceRecorder
            onCapture={(f, tx) => {
              setFile(f);
              setNoteBody(tx);
            }}
          />
        ) : type === "note" ? (
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={5}
            maxLength={5000}
            placeholder="Write your note…"
            className="w-full rounded-md border border-input bg-background p-3 text-sm outline-none ring-ring focus:ring-2"
          />
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-background p-6 text-sm text-muted-foreground hover:border-gold">
            <Upload className="size-6" />
            {file ? file.name : `Choose a ${meta.label.slice(0, -1).toLowerCase()}`}
            <input
              type="file"
              accept={meta.accept}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </label>
        )}

        {type === "voice" && (noteBody || file) && (
          <div className="mt-3 space-y-2 rounded-md border border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Transcript (editable)</p>
              <span className="text-[10px] text-muted-foreground">{noteBody.length} chars</span>
            </div>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={4}
              maxLength={10000}
              placeholder="Transcript will appear here — edit freely."
              className="w-full rounded-md border border-input bg-card p-2 text-sm outline-none ring-ring focus:ring-2"
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={keepAudio}
                onChange={(e) => setKeepAudio(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              Keep raw audio recording (uncheck to save only the transcript)
            </label>
          </div>
        )}

        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Title"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="A short description (optional)"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm hover:bg-accent">Cancel</button>
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function VoiceRecorder({ onCapture }: { onCapture: (file: File, transcript: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [language, setLanguage] = useState<string>("");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcmRef = useRef<Float32Array[]>([]);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const node = ctx.createScriptProcessor(4096, 1, 1);
      pcmRef.current = [];
      node.onaudioprocess = (e) => pcmRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(node);
      node.connect(ctx.destination);
      nodeRef.current = node;
      setRecording(true);
    } catch {
      toast.error("Microphone permission was denied.");
    }
  }

  async function stop() {
    setRecording(false);
    setProcessing(true);
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      nodeRef.current?.disconnect();
      sourceRef.current?.disconnect();
      const ctx = audioCtxRef.current!;
      const wav = encodeWav(pcmRef.current, ctx.sampleRate);
      await ctx.close();
      if (wav.size < 2048) { toast.error("Recording was empty — try again."); return; }
      const file = new File([wav], "recording.wav", { type: "audio/wav" });

      const form = new FormData();
      form.append("file", file);
      if (language) form.append("language", language);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("You must be signed in to transcribe audio");
      const res = await fetch("/api/public/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      const { text } = await res.json();
      onCapture(file, text || "");
      toast.success("Voice captured and transcribed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center">
      <button
        onClick={recording ? stop : start}
        disabled={processing}
        className={`inline-flex size-20 items-center justify-center rounded-full text-primary-foreground shadow-[var(--shadow-keepsake)] transition ${
          recording ? "animate-pulse bg-destructive" : "bg-[var(--gradient-gold)]"
        }`}
      >
        {processing ? <Loader2 className="size-8 animate-spin" /> : <Mic className="size-8" />}
      </button>
      <p className="mt-3 text-sm text-muted-foreground">
        {processing ? "Transcribing…" : recording ? "Recording — tap to stop" : "Tap to record your voice note"}
      </p>
      <label className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Languages className="size-3.5" />
        <span>Transcription language</span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={recording || processing}
          className="rounded-md border border-input bg-card px-2 py-1 text-xs text-foreground outline-none ring-ring focus:ring-2 disabled:opacity-60"
        >
          {TRANSCRIBE_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  // Downsample to 16kHz mono
  const target = 16000;
  const ratio = sampleRate / target;
  const totalIn = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(totalIn);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  const outLen = Math.floor(totalIn / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const s = merged[Math.floor(i * ratio)] || 0;
    out[i] = Math.max(-1, Math.min(1, s)) * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + out.length * 2);
  const view = new DataView(buffer);
  const write = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  write(0, "RIFF");
  view.setUint32(4, 36 + out.length * 2, true);
  write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, target, true);
  view.setUint32(28, target * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, out.length * 2, true);
  new Int16Array(buffer, 44).set(out);
  return new Blob([buffer], { type: "audio/wav" });
}
