// Server-only AES-256-GCM helpers for encrypting sensitive vault content.
// Uses VAULT_ENCRYPTION_KEY (64-char hex-like string from generate_secret; we
// derive a 32-byte key via SHA-256 to support any length/charset).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env.VAULT_ENCRYPTION_KEY;
  if (!raw) throw new Error("VAULT_ENCRYPTION_KEY is not set");
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptText(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptText(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
