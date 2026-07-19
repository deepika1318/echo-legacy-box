import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Mark an existing vault_item sensitive: move plaintext description/transcript
// into encrypted_* columns and clear the plaintext fields. Owner-only.
export const markItemSensitive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ itemId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: item, error } = await supabase
      .from("vault_items")
      .select("id, owner_id, description, transcript, is_encrypted")
      .eq("id", data.itemId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!item) throw new Error("Not found");
    if (item.owner_id !== userId) throw new Error("Forbidden");
    if (item.is_encrypted) return { ok: true };

    const { encryptText } = await import("./vault-crypto.server");
    const enc_desc = item.description ? encryptText(item.description) : null;
    const enc_tran = item.transcript ? encryptText(item.transcript) : null;

    const { error: upErr } = await supabase
      .from("vault_items")
      .update({
        is_sensitive: true,
        is_encrypted: true,
        encrypted_description: enc_desc,
        encrypted_transcript: enc_tran,
        description: null,
        transcript: null,
      })
      .eq("id", data.itemId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

// Decrypt a sensitive item's text — relies on RLS: the middleware client only
// returns the row if the caller is the owner OR family-with-access after release.
export const decryptItemText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ itemId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: item, error } = await supabase
      .from("vault_items")
      .select("id, encrypted_description, encrypted_transcript, is_encrypted")
      .eq("id", data.itemId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!item) throw new Error("Not found or not authorized");
    if (!item.is_encrypted) return { description: null, transcript: null };
    const { decryptText } = await import("./vault-crypto.server");
    return {
      description: item.encrypted_description ? decryptText(item.encrypted_description) : null,
      transcript: item.encrypted_transcript ? decryptText(item.encrypted_transcript) : null,
    };
  });

// Owner reviews an uploaded death certificate.
export const reviewCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      certId: z.string().uuid(),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cert, error } = await supabase
      .from("death_certificates")
      .select("id, owner_id, status")
      .eq("id", data.certId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cert || cert.owner_id !== userId) throw new Error("Forbidden");
    const { error: upErr } = await supabase
      .from("death_certificates")
      .update({
        status: data.decision,
        notes: data.notes ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.certId);
    if (upErr) throw new Error(upErr.message);

    // If approved, also flip vault_settings.is_released so memorial view unlocks immediately.
    if (data.decision === "approved") {
      await supabase
        .from("vault_settings")
        .update({ is_released: true, released_at: new Date().toISOString() })
        .eq("owner_id", userId);
    }
    return { ok: true };
  });
