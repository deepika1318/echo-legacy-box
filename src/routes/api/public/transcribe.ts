import { createFileRoute } from "@tanstack/react-router";

// Transcribe audio via Lovable AI. Public route: no auth header needed
// because transcription is a stateless model call, not user data.
export const Route = createFileRoute("/api/public/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
          if (!LOVABLE_API_KEY) {
            return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500 });
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

          const upstream = new FormData();
          upstream.append("model", "openai/gpt-4o-transcribe");
          upstream.append("file", file, "recording.wav");

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
