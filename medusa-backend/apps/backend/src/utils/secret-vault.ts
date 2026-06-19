import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto"

// Symmetric encryption for supplier login credentials at rest.
//
// We store practices' real supplier passwords so the headless buying agent can
// log in and build carts on their behalf. Those must never be readable from a
// DB dump alone, so every secret is sealed with AES-256-GCM under a key derived
// from SUPPLIER_CRED_KEY (an env var that lives only on the backend + NUC
// runner, never in the database).
//
// Wire format (single base64 string): salt(16) | iv(12) | authTag(16) | ciphertext
// scrypt derives the 32-byte AES key from the env passphrase + per-secret salt,
// so two encryptions of the same plaintext never collide and a leaked DB row
// can't be brute-forced without the env key.

const ALGORITHM = "aes-256-gcm"
const SALT_BYTES = 16
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32

export class MissingVaultKeyError extends Error {
  constructor() {
    super(
      "SUPPLIER_CRED_KEY is not set — refusing to encrypt or decrypt supplier credentials"
    )
    this.name = "MissingVaultKeyError"
  }
}

function passphrase(): string {
  const key = process.env.SUPPLIER_CRED_KEY
  if (!key || key.length < 16) {
    // A short/empty key would make the vault trivially breakable, so we fail
    // closed rather than silently encrypt under a weak key.
    throw new MissingVaultKeyError()
  }
  return key
}

function deriveKey(salt: Buffer): Buffer {
  return scryptSync(passphrase(), salt, KEY_BYTES)
}

export function encryptSecret(plaintext: string): string {
  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const key = deriveKey(salt)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return Buffer.concat([salt, iv, authTag, ciphertext]).toString("base64")
}

export function decryptSecret(sealed: string): string {
  const buffer = Buffer.from(sealed, "base64")
  if (buffer.length <= SALT_BYTES + IV_BYTES + TAG_BYTES) {
    throw new Error("Sealed secret is malformed or truncated")
  }

  let offset = 0
  const salt = buffer.subarray(offset, (offset += SALT_BYTES))
  const iv = buffer.subarray(offset, (offset += IV_BYTES))
  const authTag = buffer.subarray(offset, (offset += TAG_BYTES))
  const ciphertext = buffer.subarray(offset)

  const key = deriveKey(salt)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8")
}

// Non-reversible hint shown back in the UI so a buyer can confirm which login
// is stored without ever exposing the password. e.g. "ord••••@acme.com".
export function maskHint(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (trimmed.includes("@")) {
    const [user, domain] = trimmed.split("@")
    const head = user.slice(0, Math.min(3, user.length))
    return `${head}${"•".repeat(Math.max(2, user.length - head.length))}@${domain}`
  }
  return `${trimmed.slice(0, 2)}${"•".repeat(Math.max(2, trimmed.length - 2))}`
}
