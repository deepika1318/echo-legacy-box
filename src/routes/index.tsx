import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, Shield, Users, Mic, FileText, Camera } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
        <div className="flex items-center gap-2">
          <div className="grid size-10 place-items-center rounded-full bg-[var(--gradient-gold)] text-gold-foreground shadow-[var(--shadow-soft)]">
            <Heart className="size-5" strokeWidth={2.25} />
          </div>
          <span className="font-serif text-2xl tracking-tight">AI Digital Vault</span>
        </div>
        <Link
          to="/auth"
          className="rounded-md border border-primary/20 bg-card px-4 py-2 text-sm font-medium text-primary shadow-[var(--shadow-soft)] transition hover:bg-accent"
        >
          Sign in
        </Link>
      </header>

      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center md:py-32">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-gold" /> A keepsake for the ones you love
          </p>
          <h1 className="text-balance font-serif text-5xl leading-[1.05] text-primary md:text-7xl">
            Every memory,<br />
            <span className="italic text-sepia/80">preserved with care.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            A private digital vault for the photos, videos, files, property certificates, and voice notes
            that make a life. Released gently to your family — only when the time comes.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              to="/auth"
              className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[var(--shadow-keepsake)] transition hover:opacity-90"
            >
              Create your vault
            </Link>
            <Link
              to="/auth"
              className="rounded-md border border-primary/20 bg-card px-6 py-3 text-sm font-medium text-primary transition hover:bg-accent"
            >
              Family sign in
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-24">
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border/60 bg-card p-6 shadow-[var(--shadow-soft)]">
              <div className="grid size-10 place-items-center rounded-full bg-accent text-sepia">{f.icon}</div>
              <h3 className="mt-4 font-serif text-xl">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border/60 bg-card/40">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <h2 className="font-serif text-3xl text-primary md:text-4xl">How the legacy unlock works</h2>
          <ol className="mx-auto mt-10 grid max-w-3xl gap-6 text-left md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-border/60 bg-background/60 p-5">
                <div className="font-serif text-4xl text-gold">{String(i + 1).padStart(2, "0")}</div>
                <h4 className="mt-2 font-serif text-lg">{s.title}</h4>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        A gentle place to keep what matters. © AI Digital Vault.
      </footer>
    </div>
  );
}

const features = [
  { icon: <Camera className="size-5" />, title: "Photos & videos", body: "Every candid, every celebration — organized and stored privately in your vault." },
  { icon: <FileText className="size-5" />, title: "Documents & certificates", body: "Property deeds, wills, insurance, IDs. All in one trusted place." },
  { icon: <Mic className="size-5" />, title: "Voice notes, transcribed", body: "Speak the story. We capture your voice and turn it into readable text." },
  { icon: <Shield className="size-5" />, title: "Private by default", body: "Only you can see your vault. Family access is sealed until you release it." },
  { icon: <Users className="size-5" />, title: "For the family", body: "Invite loved ones by email — they'll each sign in with their own account." },
  { icon: <Heart className="size-5" />, title: "Legacy check-ins", body: "Regular check-ins keep the vault yours. Missed ones open it to your family." },
];

const steps = [
  { title: "You build the vault", body: "Upload memories, files, and voice notes across your life. Nothing is shared while you're active." },
  { title: "You invite family", body: "Add the emails of people who should inherit access. They create their own accounts." },
  { title: "Legacy unlock", body: "Mark the vault released, or if your check-ins lapse past your chosen window, family can view it." },
];
