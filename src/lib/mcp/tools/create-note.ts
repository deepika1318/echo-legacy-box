import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthed, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_note",
  title: "Create note",
  description:
    "Add a text note memory to the signed-in user's vault. Use for written memories, reflections, or transcribed thoughts.",
  inputSchema: {
    title: z.string().min(1).max(200).describe("Short title for the note."),
    body: z.string().min(1).max(20000).describe("Note contents / memory text."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ title, body }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("vault_items")
      .insert({
        owner_id: ctx.getUserId(),
        title,
        description: body,
        item_type: "note",
      })
      .select("id, title, item_type, created_at")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created note: ${data?.id}` }],
      structuredContent: { item: data },
    };
  },
});
