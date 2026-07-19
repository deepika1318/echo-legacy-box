import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera, Video, FileText, Award, StickyNote, Mic, Upload, Trash2, Plus,
  Loader2, Play, Download, X, Languages, Pencil, Check,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

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

function VaultPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ItemType | "all">("all");
  const [uploadOpen, setUploadOpen] = useState<null | ItemType>(null);

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

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.item_type === filter)),
    [items, filter]
  );

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
      </div>

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
          <p className="font-serif text-2xl text-primary">Nothing here yet</p>
          <p className="mt-2 text-sm text-muted-foreground">Add your first memory above.</p>
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
              {url && (
                <button onClick={() => setViewer(true)} className="rounded-md p-1.5 hover:bg-accent" title="Open">
                  {item.item_type === "video" || item.item_type === "voice" ? <Play className="size-4" /> : <Download className="size-4" />}
                </button>
              )}
              <button onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remove">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewer && url && (
        <Viewer item={item} url={url} onClose={() => setViewer(false)} />
      )}
    </>
  );
}

function Viewer({ item, url, onClose }: { item: Item; url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1.5 hover:bg-accent"><X className="size-4" /></button>
        <h2 className="font-serif text-2xl">{item.title}</h2>
        {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
        <div className="mt-4">
          {item.item_type === "photo" && <img src={url} alt={item.title} className="mx-auto max-h-[60vh] rounded-lg" />}
          {item.item_type === "video" && <video src={url} controls className="mx-auto max-h-[60vh] w-full rounded-lg" />}
          {item.item_type === "voice" && <audio src={url} controls className="mx-auto w-full" />}
          {(item.item_type === "file" || item.item_type === "certificate") && (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
              <Download className="size-4" /> Download {item.title}
            </a>
          )}
        </div>
        {item.transcript && (
          <div className="mt-6 rounded-lg border border-border bg-background p-4">
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Transcript</p>
            <p className="whitespace-pre-wrap text-sm">{item.transcript}</p>
          </div>
        )}
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
  const meta = TYPE_META[type];

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
      } else {
        if (!file) throw new Error("Please choose a file");
        const path = `${u.user.id}/${type}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("vault").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        storage_path = path;
        mime_type = file.type;
        size_bytes = file.size;
      }

      const { error } = await supabase.from("vault_items").insert({
        owner_id: u.user.id,
        item_type: type,
        title: title.trim() || file?.name || "Untitled",
        description: description.trim() || null,
        storage_path,
        mime_type,
        size_bytes,
        transcript,
      });
      if (error) throw error;
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

        {type === "voice" && noteBody && (
          <div className="mt-3 rounded-md border border-border bg-background p-3">
            <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Transcript</p>
            <p className="text-sm">{noteBody}</p>
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
      const res = await fetch("/api/public/transcribe", { method: "POST", body: form });
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
