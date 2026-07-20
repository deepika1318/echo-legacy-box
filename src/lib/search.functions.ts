import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMBED_MODEL = "openai/text-embedding-3-small"; // 1536 dims

async function embed(text: string): Promise<number[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

function buildText(row: {
  title: string;
  description: string | null;
  transcript: string | null;
  item_type: string;
}) {
  return [row.item_type, row.title, row.description, row.transcript]
    .filter(Boolean)
    .join("\n");
}

// Embed a single item (or all missing) for the current user.
export const embedItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ itemId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let query = supabase
      .from("vault_items")
      .select("id, title, description, transcript, item_type, is_encrypted, encrypted_description, encrypted_transcript")
      .eq("owner_id", userId);
    if (data.itemId) query = query.eq("id", data.itemId);
    else query = query.is("embedding", null);
    const { data: rows, error } = await query.limit(50);
    if (error) throw new Error(error.message);
    if (!rows?.length) return { embedded: 0 };

    let decryptText: ((s: string) => string) | null = null;
    if (rows.some((r) => r.is_encrypted)) {
      const mod = await import("./vault-crypto.server");
      decryptText = mod.decryptText;
    }

    let count = 0;
    for (const r of rows) {
      const desc = r.is_encrypted && decryptText && r.encrypted_description
        ? decryptText(r.encrypted_description) : r.description;
      const tran = r.is_encrypted && decryptText && r.encrypted_transcript
        ? decryptText(r.encrypted_transcript) : r.transcript;
      const text = buildText({ title: r.title, description: desc, transcript: tran, item_type: r.item_type });
      if (!text.trim()) continue;
      try {
        const vec = await embed(text);
        const { error: upErr } = await supabase
          .from("vault_items")
          .update({ embedding: vec as unknown as string, search_text: text })
          .eq("id", r.id);
        if (upErr) throw upErr;
        count++;
      } catch (e) {
        console.error("embed failed for", r.id, e);
      }
    }
    return { embedded: count };
  });

// Semantic search — returns matched item ids with scores.
export const searchMemories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      query: z.string().min(1).max(500),
      ownerId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(30).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vec = await embed(data.query);
    const { data: matches, error } = await supabase.rpc("match_vault_items", {
      _owner: data.ownerId ?? userId,
      query_embedding: vec as unknown as string,
      match_count: data.limit ?? 12,
      min_similarity: 0.15,
    });
    if (error) throw new Error(error.message);
    return { matches: (matches ?? []) as { id: string; similarity: number }[] };
  });
