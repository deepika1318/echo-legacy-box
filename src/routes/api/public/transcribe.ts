import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Transcribe audio via Lovable AI. Requires a valid signed-in Supabase session
// (bearer token) to prevent unauthenticated abuse of the paid AI transcription API.
export const Route = createFileRoute("/api/public/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
          const SUPABASE_URL = process.env.SUPABASE_URL;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
            return new Response(JSON.stringify({ error: "Server not configured" }), { status: 500 });
          }

          // Require a valid Supabase session bearer token.
          const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
          const token = authHeader?.toLowerCase().startsWith("bearer ")
            ? authHeader.slice(7).trim()
            : "";
          if (!token) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
          }
          const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: {
              fetch: (input, init) => {
                const h = new Headers(init?.headers);
                if (SUPABASE_PUBLISHABLE_KEY.startsWith("sb_") && h.get("Authorization") === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`) {
                  h.delete("Authorization");
                }
                h.set("apikey", SUPABASE_PUBLISHABLE_KEY);
                return fetch(input, { ...init, headers: h });
              },
            },
          });
          const { data: userData, error: userErr } = await authClient.auth.getUser(token);
          if (userErr || !userData?.user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
          }

          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) {
            return new Response(JSON.stringify({ error: "Missing audio file" }), { status: 400 });
          }
          if (file.size < 1024) {
            return new Response(JSON.stringify({ error: "Recording too short" }), { status: 400 });
          }
          if (file.size > 20 * 1024 * 1024) {
            return new Response(JSON.stringify({ error: "Recording too large" }), { status: 400 });
          }

          const language = (form.get("language") as string | null)?.trim() || "";

          const upstream = new FormData();
          upstream.append("model", "openai/gpt-4o-transcribe");
          upstream.append("file", file, "recording.wav");
          if (/^[a-z]{2}$/i.test(language)) {
            upstream.append("language", language.toLowerCase());
          }

          const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
            body: upstream,
          });
          const text = await res.text();
          if (!res.ok) {
            console.error("Transcription failed:", res.status, text);
            return new Response(JSON.stringify({ error: `Transcription failed (${res.status})` }), { status: res.status });
          }
          const json = JSON.parse(text);
          return Response.json({ text: json.text || "" });
        } catch (e) {
          console.error(e);
          return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Failed" }), { status: 500 });
        }
      },
    },
  },
});
