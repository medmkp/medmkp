import {
  decryptSecret,
  encryptSecret,
  maskHint,
  MissingVaultKeyError,
} from "../secret-vault"

const KEY = "test-vault-key-0123456789abcdef"

describe("secret-vault", () => {
  const original = process.env.SUPPLIER_CRED_KEY

  beforeEach(() => {
    process.env.SUPPLIER_CRED_KEY = KEY
  })

  afterAll(() => {
    if (original === undefined) delete process.env.SUPPLIER_CRED_KEY
    else process.env.SUPPLIER_CRED_KEY = original
  })

  it("round-trips a secret", () => {
    const secret = "hunter2-Sup3r$ecret"
    expect(decryptSecret(encryptSecret(secret))).toBe(secret)
  })

  it("round-trips unicode and long values", () => {
    const secret = "pässwörd-😀-" + "x".repeat(500)
    expect(decryptSecret(encryptSecret(secret))).toBe(secret)
  })

  it("produces a different ciphertext each time (random salt+iv)", () => {
    const secret = "same-input"
    expect(encryptSecret(secret)).not.toBe(encryptSecret(secret))
  })

  it("fails to decrypt a tampered ciphertext (GCM auth)", () => {
    const sealed = encryptSecret("dont-touch-me")
    const buf = Buffer.from(sealed, "base64")
    buf[buf.length - 1] ^= 0xff // flip a ciphertext byte
    expect(() => decryptSecret(buf.toString("base64"))).toThrow()
  })

  it("cannot decrypt with a different key", () => {
    const sealed = encryptSecret("secret")
    process.env.SUPPLIER_CRED_KEY = "totally-different-key-987654321"
    expect(() => decryptSecret(sealed)).toThrow()
  })

  it("rejects malformed input", () => {
    expect(() => decryptSecret("not-real")).toThrow()
  })

  it("fails closed when the key is missing or weak", () => {
    delete process.env.SUPPLIER_CRED_KEY
    expect(() => encryptSecret("x")).toThrow(MissingVaultKeyError)
    process.env.SUPPLIER_CRED_KEY = "short"
    expect(() => encryptSecret("x")).toThrow(MissingVaultKeyError)
  })

  it("masks an email login without leaking the password", () => {
    expect(maskHint("orders@acme.com")).toBe("ord•••@acme.com")
    expect(maskHint("ab@x.com")).toBe("ab••@x.com")
  })

  it("masks a non-email login", () => {
    expect(maskHint("drsmith")).toBe("dr•••••")
  })
})
