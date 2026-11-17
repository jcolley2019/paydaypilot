// PP.9.1 — Plaid access-token encryption at rest.
// AES-256-GCM, key = PLAID_TOKEN_KEY (base64 of 32 bytes), a fresh 12-byte IV per token,
// stored as "v1.<iv b64>.<ciphertext b64>" (the ciphertext carries GCM's 16-byte tag).
// Web Crypto only — no Deno or npm imports — so vitest and Node scripts can import it too.

const VERSION = 'v1'
const IV_BYTES = 12
const KEY_BYTES = 32

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function importKey(keyBase64: string): Promise<CryptoKey> {
  let raw: Uint8Array<ArrayBuffer>
  try {
    raw = base64ToBytes(keyBase64.trim())
  } catch {
    throw new Error('PLAID_TOKEN_KEY is not valid base64')
  }
  if (raw.length !== KEY_BYTES) throw new Error(`PLAID_TOKEN_KEY must decode to ${KEY_BYTES} bytes`)
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptToken(plaintext: string, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  return `${VERSION}.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`
}

/** Throws when the value is malformed, or the key is wrong (GCM authentication fails). */
export async function decryptToken(stored: string, keyBase64: string): Promise<string> {
  const parts = stored.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) throw new Error('Unrecognised encrypted token format')
  const iv = base64ToBytes(parts[1])
  if (iv.length !== IV_BYTES) throw new Error('Encrypted token has a bad IV')
  const key = await importKey(keyBase64)
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBytes(parts[2]))
  } catch {
    throw new Error('Could not decrypt the token (wrong key or corrupted value)')
  }
  return new TextDecoder().decode(plaintext)
}
