/**
 * ZaiMem crypto helpers — AES-256-GCM encryption at rest for user secrets
 * (GitHub PATs). Key is derived with scrypt from ZAIMEM_SECRET (or a stable
 * app fallback so the sandbox works without extra env setup).
 *
 * Never log plaintext secrets. patHint keeps only the last 4 chars.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";

const SECRET = process.env.ZAIMEM_SECRET || "zaimem-default-secret-rotate-me";
const KEY = scryptSync(SECRET, "zaimem-pat-salt-v1", 32);

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("corrupt secret payload");
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Display hint: everything masked, last 4 chars visible. */
export function secretHint(plain: string): string {
  const tail = plain.slice(-4);
  return "••••" + tail;
}

/**
 * Git blob SHA-1 (how GitHub identifies file contents).
 * Used to skip pushing files whose content is unchanged.
 * sha1("blob <len>\0<content>")
 */
export function computeBlobSha(content: string): string {
  const buf = Buffer.from(content, "utf8");
  const header = Buffer.from(`blob ${buf.length}\0`);
  return createHash("sha1").update(Buffer.concat([header, buf])).digest("hex");
}
