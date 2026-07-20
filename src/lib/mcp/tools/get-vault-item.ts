import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthed, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_vault_item",
  title: "Get vault item",
  description:
    "Fetch full details of one vault item by id, including description and transcript (decrypted for the owner or a family member with released access).",
  inputSchema: {
    id: z.string().uuid().describe("Vault item id."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const supabase = supabaseForUser(ctx);
    const { data: item, error } = await supabase
      .from("vault_items")
      .select(
        "id, title, item_type, description, transcript, storage_path, created_at, is_sensitive, is_encrypted, encrypted_description, encrypted_transcript",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!item) return { content: [{ type: "text", text: "Not found or not authorized" }], isError: true };

    let description = item.description;
    let transcript = item.transcript;
    if (item.is_encrypted) {
      const { decryptText } = await import("@/lib/vault-crypto.server");
      if (item.encrypted_description) description = decryptText(item.encrypted_description);
      if (item.encrypted_transcript) transcript = decryptText(item.encrypted_transcript);
    }

    const result = {
      id: item.id,
      title: item.title,
      category: item.item_type,
      description,
      transcript,
      storage_path: item.storage_path,
      created_at: item.created_at,
      is_sensitive: item.is_sensitive,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
