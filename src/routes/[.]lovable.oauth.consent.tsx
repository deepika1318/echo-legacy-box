import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Heart } from "lucide-react";

// Minimal typed wrapper — the auth.oauth namespace is beta in supabase-js.
type OAuthClient = { name?: string; redirect_uri?: string } | null;
type AuthzDetails = {
  client?: OAuthClient;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthzDetails | null; error: Error | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthzDetails | null; error: Error | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthzDetails | null; error: Error | null }>;
};
const oauthApi = (): OAuthApi =>
  (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId =
      new URLSearchParams(location.search).get("authorization_id") ?? "";
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-8">
      <h1 className="font-serif text-2xl text-primary">Authorization error</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "an app";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 shadow-[var(--shadow-keepsake)]">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="grid size-10 place-items-center rounded-full bg-[var(--gradient-gold)] text-gold-foreground shadow-[var(--shadow-soft)]">
            <Heart className="size-5" strokeWidth={2.25} />
          </div>
          <span className="font-serif text-2xl tracking-tight">AI Digital Vault</span>
        </div>
        <h1 className="font-serif text-2xl text-primary">Connect {clientName} to your vault</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {clientName} will be able to use this app's tools while you are signed in —
          search your memories, list vault items, and add notes on your behalf.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          This does not bypass your vault's permissions or family access policies.
        </p>
        {error && (
          <p role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] transition hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Please wait…" : "Approve"}
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
          >
            Deny
          </button>
        </div>
      </div>
    </main>
  );
}
