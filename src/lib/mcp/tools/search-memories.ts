import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthed, supabaseForUser } from "../supabase";

const EMBED_MODEL = "openai/text-embedding-3-small";

async function embed(text: string): Promise<number[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000) }),
  });
  if (!res.ok) throw new Error(`Embedding failed (${res.status})`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

export default defineTool({
  name: "search_memories",
  title: "Search memories",
  description:
    "Semantic search across the signed-in user's vault items using natural language (e.g. 'graduation photos', 'notes about grandma's recipes'). Returns ranked matches with id, title, category, and similarity score.",
  inputSchema: {
    query: z.string().min(1).max(500).describe("Natural-language search query."),
    limit: z.number().int().min(1).max(30).optional().describe("Max matches (default 10)."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const userId = ctx.getUserId();
    if (!userId) return notAuthed();
    const supabase = supabaseForUser(ctx);
    try {
      const vec = await embed(query);
      const { data, error } = await supabase.rpc("match_vault_items", {
        _owner: userId,
        query_embedding: vec as unknown as string,
        match_count: limit ?? 10,
      });
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return {
        content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
        structuredContent: { matches: data ?? [] },
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: e instanceof Error ? e.message : "Search failed" }],
        isError: true,
      };
    }
  },
});
