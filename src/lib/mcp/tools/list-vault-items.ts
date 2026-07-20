import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthed, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_vault_items",
  title: "List vault items",
  description:
    "List items in the signed-in user's vault. Optionally filter by category (photo, video, file, certificate, voice_note, note) and limit results. Returns id, title, category, and creation time — use get_vault_item for full details.",
  inputSchema: {
    category: z
      .enum(["photo", "video", "file", "certificate", "voice_note", "note"])
      .optional()
      .describe("Filter by item category."),
    limit: z.number().int().min(1).max(100).optional().describe("Max items to return (default 25)."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ category, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("vault_items")
      .select("id, title, item_type, created_at, is_sensitive")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (category) q = q.eq("item_type", category);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { items: data ?? [] },
    };
  },
});
