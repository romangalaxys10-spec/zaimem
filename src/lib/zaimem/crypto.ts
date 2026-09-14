/**
 * ZaiMem crypto helpers — AES-256-GCM encryption at rest for user secrets
 * (GitHub PATs). Key is derived with scrypt from ZAIMEM_SECRET.
 *
 * v1.7.2 security audit hardening:
 *  • ZAIMEM_SECRET is now REQUIRED in production (.env). If it is unset, the
 *    legacy public fallback key is used (compat with pre-1.7.2 data) and a
 *    console warning is emitted once.
 *  • decryptSecretUpgradable() transparently decrypts payloads written under
 *    the legacy key and flags them for re-encryption under the current key
 *    (auto-heal in github.ts).
 *
 * Never log plaintext secrets. patHint keeps only the last 4 chars.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";

const LEGACY_SECRET = "zaimem-default-secret-rotate-me";
const SECRET = process.env.ZAIMEM_SECRET || LEGACY_SECRET;

if (!process.env.ZAIMEM_SECRET) {
  console.warn(
    "[zaimem-security] ZAIMEM_SECRET is not set — falling back to the PUBLIC legacy key. " +
      "Set ZAIMEM_SECRET in .env (openssl rand -hex 32) and re-pair GitHub links to re-encrypt.",
  );
}

const KEY = scryptSync(SECRET, "zaimem-pat-salt-v1", 32);
// Only present when a real env secret is configured; used to read pre-1.7.2 payloads.
const LEGACY_KEY = SECRET === LEGACY_SECRET ? null : scryptSync(LEGACY_SECRET, "zaimem-pat-salt-v1", 32);

function encryptWith(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

function decryptWith(key: Buffer, payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("corrupt secret payload");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

export function encryptSecret(plain: string): string {
  return encryptWith(KEY, plain);
}

export function decryptSecret(payload: string): string {
  return decryptWith(KEY, payload);
}

/**
 * Decrypt with the current key; if that fails and the payload was written
 * under the legacy public key, decrypt with it and report `upgraded: true`
 * so the caller can persist the re-encrypted form.
 */
export function decryptSecretUpgradable(payload: string): { plain: string; upgraded: boolean } {
  try {
    return { plain: decryptWith(KEY, payload), upgraded: false };
  } catch (e) {
    if (!LEGACY_KEY) throw e;
    const plain = decryptWith(LEGACY_KEY, payload);
    return { plain, upgraded: true };
  }
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
