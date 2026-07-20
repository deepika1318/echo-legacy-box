import { defineTool } from "@lovable.dev/mcp-js";
import { notAuthed, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_family_members",
  title: "List family members",
  description:
    "List family members invited to the signed-in user's vault along with their per-category access permissions.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("family_members")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { members: data ?? [] },
    };
  },
});
