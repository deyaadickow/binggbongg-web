// Password Protected Page (Steve, 2026-10-24) — the member's own password vault.
//
// THE KEY NEVER LEAVES THIS DEVICE. Everything sent to the server is AES-256-GCM ciphertext that
// the server has no way to decrypt, because it has never seen the passcode and never will.
//
// Steve chose this knowing the cost, and it is not a detail to soften later: a member who forgets
// their passcode loses the vault permanently. Nobody can recover it. The alternative — a key the
// server holds — would mean one breach of our host hands an attacker 3,944 members' real bank and
// email passwords, so "we can reset it for you" was never compatible with the feature.
//
// FORMAT v1 — all four clients must agree byte for byte:
//   wrapping key = PBKDF2-HMAC-SHA256(passcode, salt, iterations) -> 32 bytes
//   data key     = 32 random bytes, made once on the device
//   wrapped key  = seal(wrapping key, data key)
//   item         = seal(data key, JSON)
//   blob layout  = base64( IV(12) || ciphertext || GCM tag(16) )
// WebCrypto appends the tag to the ciphertext, Java's GCM does the same, and CryptoKit's
// `.combined` is nonce||ciphertext||tag — so this one layout is native on every platform.
//
// Verified against a reference vector (see VECTOR below) rather than assumed.
import { post } from "./api";

export const VAULT_KDF_ITERATIONS = 210_000;
const VERIFIER_PLAINTEXT = "binggbongg-vault-v1";

/** Steve's rule is a real passcode, not a PIN: this table is brute-forceable offline if the
 *  server is ever breached, and four digits would fall in seconds however high the KDF cost. */
export const VAULT_MIN_PASSCODE = 8;

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The recovery code alphabet. No 0/O/1/I/L — this gets written on paper and read back by hand,
 * and a code that cannot be transcribed reliably is not a recovery.
 */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_GROUPS = 6;
const RECOVERY_GROUP_LEN = 5;

/** ~147 bits. Generated here, shown once, and never sent to the server. */
export function newRecoveryCode(): string {
  const n = RECOVERY_GROUPS * RECOVERY_GROUP_LEN;
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let out = "";
  for (let i = 0; i < n; i++) {
    // Modulo bias is negligible at 31 symbols over 256 and irrelevant at this entropy.
    out += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
    if ((i + 1) % RECOVERY_GROUP_LEN === 0 && i + 1 < n) out += "-";
  }
  return out;
}

/** Typed back in, people add spaces, lose dashes and use lower case. All of that is fine. */
export function normaliseRecoveryCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** PBKDF2-HMAC-SHA256 -> a 256-bit AES-GCM key. */
export async function deriveWrappingKey(passcode: string, saltB64: string, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64decode(saltB64) as BufferSource, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** base64( IV || ciphertext||tag ) */
export async function seal(key: CryptoKey, plaintext: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext as BufferSource));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return b64encode(out);
}

/** Throws if the key is wrong or the bytes were tampered with — GCM authenticates, so a wrong
 *  passcode fails here rather than returning garbage. That is what tells the two apart. */
export async function open(key: CryptoKey, blobB64: string): Promise<Uint8Array> {
  const blob = b64decode(blobB64);
  const iv = blob.slice(0, 12);
  const body = blob.slice(12);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, body as BufferSource));
}

export interface VaultEntry {
  id?: number;
  title: string;
  username: string;
  password: string;
  notes: string;
}

export interface VaultStatus {
  is_set_up: boolean;
  /** Whether a recovery code was ever set up. Null for a vault made before recovery existed. */
  has_recovery?: boolean;
  recovery_salt?: string | null;
  recovery_wrapped_key?: string | null;
  recovery_verifier?: string | null;
  kdf_salt: string | null;
  kdf_iterations: number;
  wrapped_key: string | null;
  verifier: string | null;
  item_count: number;
}

export async function fetchVaultStatus(userId: number): Promise<VaultStatus | null> {
  try {
    const r = await post<VaultStatus>("fetchVaultStatus", { user_id: userId });
    return r.status ? (r.data ?? null) : null;
  } catch { return null; }
}

/** First-time setup: make a data key, wrap it under the passcode, hand over only the ciphertext. */
export async function setupVault(userId: number, passcode: string, recoveryCode: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = b64encode(salt);
  const wrappingKey = await deriveWrappingKey(passcode, saltB64, VAULT_KDF_ITERATIONS);
  const dataKey = crypto.getRandomValues(new Uint8Array(32));

  // The SAME data key, wrapped a second time under the recovery code. That is what makes
  // recovery possible without this server ever being able to read anything: forgetting the
  // passcode costs you the first wrapping, not the key.
  const recSalt = crypto.getRandomValues(new Uint8Array(16));
  const recSaltB64 = b64encode(recSalt);
  const recKey = await deriveWrappingKey(normaliseRecoveryCode(recoveryCode), recSaltB64, VAULT_KDF_ITERATIONS);

  return post("setupVault", {
    user_id: userId,
    kdf_salt: saltB64,
    kdf_iterations: VAULT_KDF_ITERATIONS,
    wrapped_key: await seal(wrappingKey, dataKey),
    verifier: await seal(wrappingKey, new TextEncoder().encode(VERIFIER_PLAINTEXT)),
    recovery_salt: recSaltB64,
    recovery_wrapped_key: await seal(recKey, dataKey),
    recovery_verifier: await seal(recKey, new TextEncoder().encode(VERIFIER_PLAINTEXT)),
  });
}

/**
 * Unlock with the RECOVERY CODE instead of the passcode. Returns the raw data key, because the
 * only thing worth doing next is setting a new passcode around it.
 */
export async function unlockWithRecoveryCode(status: VaultStatus, code: string): Promise<Uint8Array | null> {
  if (!status.recovery_salt || !status.recovery_verifier || !status.recovery_wrapped_key) return null;
  try {
    const key = await deriveWrappingKey(normaliseRecoveryCode(code), status.recovery_salt, status.kdf_iterations);
    const check = new TextDecoder().decode(await open(key, status.recovery_verifier));
    if (check !== VERIFIER_PLAINTEXT) return null;
    return await open(key, status.recovery_wrapped_key);
  } catch {
    return null;
  }
}

/**
 * Unlock: derive the key, check it against the verifier, unwrap the data key.
 * Returns null for a wrong passcode — the GCM tag is what decides, not a comparison we could
 * get wrong, and it is checked on THIS device, never by the server.
 */
/** Kept so a passcode change can re-wrap without asking for the old passcode again. Module
 *  scope, cleared on lock — never storage, never the server. */
let lastRawDataKey: Uint8Array | null = null;
export function rawDataKey(): Uint8Array | null { return lastRawDataKey; }
export function forgetRawDataKey() { lastRawDataKey = null; }

export async function unlockVault(status: VaultStatus, passcode: string): Promise<CryptoKey | null> {
  if (!status.is_set_up || !status.kdf_salt || !status.verifier || !status.wrapped_key) return null;
  try {
    const wrappingKey = await deriveWrappingKey(passcode, status.kdf_salt, status.kdf_iterations);
    const check = new TextDecoder().decode(await open(wrappingKey, status.verifier));
    if (check !== VERIFIER_PLAINTEXT) return null;
    const dataKey = await open(wrappingKey, status.wrapped_key);
    lastRawDataKey = dataKey;
    return crypto.subtle.importKey("raw", dataKey as BufferSource, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

export async function fetchVaultItems(userId: number, dataKey: CryptoKey): Promise<VaultEntry[]> {
  try {
    const r = await post<Array<{ id: number; ciphertext: string }>>("fetchVaultItems", { user_id: userId });
    if (!r.status || !r.data) return [];
    const out: VaultEntry[] = [];
    for (const row of r.data) {
      try {
        const json = new TextDecoder().decode(await open(dataKey, row.ciphertext));
        out.push({ ...(JSON.parse(json) as VaultEntry), id: row.id });
      } catch {
        // One unreadable row must not blank the whole page. It can only happen if the row was
        // written under a different data key, which this design does not produce.
      }
    }
    return out;
  } catch { return []; }
}

export async function saveVaultItem(userId: number, dataKey: CryptoKey, entry: VaultEntry) {
  const body = JSON.stringify({
    title: entry.title, username: entry.username, password: entry.password, notes: entry.notes,
  });
  return post("saveVaultItem", {
    user_id: userId,
    ...(entry.id ? { item_id: entry.id } : {}),
    ciphertext: await seal(dataKey, new TextEncoder().encode(body)),
  });
}

export async function deleteVaultItem(userId: number, itemId: number) {
  return post("deleteVaultItem", { user_id: userId, item_id: itemId });
}

/** Only the wrapped key changes — the items stay encrypted under the same data key. */
export async function changeVaultPasscode(
  userId: number,
  dataKeyRaw: Uint8Array,
  newPasscode: string,
  newRecoveryCode?: string,
) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = b64encode(salt);
  const wrappingKey = await deriveWrappingKey(newPasscode, saltB64, VAULT_KDF_ITERATIONS);

  // A new recovery code is OPTIONAL here. Omitting it leaves the existing recovery wrapping
  // untouched and still valid, because the data key has not changed — the server deliberately
  // does not rewrite it unless all three fields arrive together.
  let recovery = {};
  if (newRecoveryCode) {
    const recSalt = crypto.getRandomValues(new Uint8Array(16));
    const recSaltB64 = b64encode(recSalt);
    const recKey = await deriveWrappingKey(normaliseRecoveryCode(newRecoveryCode), recSaltB64, VAULT_KDF_ITERATIONS);
    recovery = {
      recovery_salt: recSaltB64,
      recovery_wrapped_key: await seal(recKey, dataKeyRaw),
      recovery_verifier: await seal(recKey, new TextEncoder().encode(VERIFIER_PLAINTEXT)),
    };
  }

  return post("changeVaultPasscode", {
    user_id: userId,
    kdf_salt: saltB64,
    kdf_iterations: VAULT_KDF_ITERATIONS,
    wrapped_key: await seal(wrappingKey, dataKeyRaw),
    verifier: await seal(wrappingKey, new TextEncoder().encode(VERIFIER_PLAINTEXT)),
    ...recovery,
  });
}

/** ERASES the vault. Not a recovery — there is none. */
export async function forgetVault(userId: number) {
  return post("forgetVault", { user_id: userId });
}

/**
 * The cross-platform reference vector. Decrypting this needs PBKDF2-HMAC-SHA256, AES-256-GCM and
 * the IV||ct||tag layout to ALL match, so it is a real interop check rather than a hope. Android
 * and iOS carry the same constants; if a platform ever disagrees, vaults made on one would be
 * unreadable on another, which a member would experience as losing their passwords.
 */
export const VECTOR = {
  passcode: "correct horse battery",
  saltB64: "AAECAwQFBgcICQoLDA0ODw==",
  iterations: VAULT_KDF_ITERATIONS,
  blobB64: "AAECAwQFBgcICQoLhWSUs5RIzHrTDdq4bPoY7SVa6+KHr0J3CnAvfLXOQpnel3s=",
  expect: VERIFIER_PLAINTEXT,
};

export async function selfTest(): Promise<boolean> {
  try {
    const key = await deriveWrappingKey(VECTOR.passcode, VECTOR.saltB64, VECTOR.iterations);
    return new TextDecoder().decode(await open(key, VECTOR.blobB64)) === VECTOR.expect;
  } catch { return false; }
}
