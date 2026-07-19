import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "At least 8 characters").max(72),
  fullName: z.string().trim().max(80).optional(),
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) nav({ to: "/vault", replace: true });
    });
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        if (!email.trim()) throw new Error("Enter your email");
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Check your email for a reset link.");
        setMode("signin");
        return;
      }
      const parsed = schema.safeParse({ email, password, fullName: mode === "signup" ? fullName : undefined });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/vault`,
            data: { full_name: fullName || null },
          },
        });
        if (error) throw error;
        toast.success("Vault created — welcome.");
        nav({ to: "/vault", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
        nav({ to: "/vault", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your vault" : "Reset your password";
  const subtitle =
    mode === "signin"
      ? "Sign in to continue preserving your memories, or to view a loved one's vault."
      : mode === "signup"
      ? "Start with an email and password. You can invite family once you're inside."
      : "Enter the email on your account and we'll send you a reset link.";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="grid size-10 place-items-center rounded-full bg-[var(--gradient-gold)] text-gold-foreground shadow-[var(--shadow-soft)]">
            <Heart className="size-5" strokeWidth={2.25} />
          </div>
          <span className="font-serif text-2xl tracking-tight">AI Digital Vault</span>
        </Link>

        <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-[var(--shadow-keepsake)]">
          <h1 className="font-serif text-3xl text-primary">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <Field label="Your name (optional)">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
                  placeholder="Eleanor Whitfield"
                  maxLength={80}
                />
              </Field>
            )}
            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
                placeholder="you@example.com"
                maxLength={255}
              />
            </Field>
            {mode !== "forgot" && (
              <Field label="Password">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
                  placeholder="At least 8 characters"
                  minLength={8}
                  maxLength={72}
                />
              </Field>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create vault" : "Send reset link"}
            </button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-2 text-sm text-muted-foreground">
            {mode === "signin" && (
              <>
                <button onClick={() => setMode("forgot")} className="text-primary underline-offset-2 hover:underline">
                  Forgot password?
                </button>
                <span>
                  New here?{" "}
                  <button onClick={() => setMode("signup")} className="font-medium text-primary underline-offset-2 hover:underline">
                    Create a vault
                  </button>
                </span>
              </>
            )}
            {mode === "signup" && (
              <span>
                Already have a vault?{" "}
                <button onClick={() => setMode("signin")} className="font-medium text-primary underline-offset-2 hover:underline">
                  Sign in
                </button>
              </span>
            )}
            {mode === "forgot" && (
              <button onClick={() => setMode("signin")} className="font-medium text-primary underline-offset-2 hover:underline">
                Back to sign in
              </button>
            )}
          </div>
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
