import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listItemsTool from "./tools/list-vault-items";
import searchTool from "./tools/search-memories";
import getItemTool from "./tools/get-vault-item";
import createNoteTool from "./tools/create-note";
import listFamilyTool from "./tools/list-family-members";

// OAuth issuer must be the direct Supabase host, built from the inlined ref.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "ai-digital-vault-mcp",
  title: "AI Digital Vault",
  version: "0.1.0",
  instructions:
    "Tools to read and add to the signed-in user's AI Digital Vault — a private archive of memories, photos, videos, files, certificates, and voice notes. Use `search_memories` for natural-language queries (e.g. 'graduation photos'), `list_vault_items` to browse by category, `get_vault_item` for details on a single item (transcripts included), `create_note` to add a text memory, and `list_family_members` to see who has legacy access.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchTool, listItemsTool, getItemTool, createNoteTool, listFamilyTool],
});
