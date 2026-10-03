const VERSION = "v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlDecode(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function encryptionKey() {
  const secret = process.env.SHOPIFY_API_SECRET?.trim();
  if (!secret) {
    throw new Error("SHOPIFY_API_SECRET is required for secret encryption.");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`vsn-stock-down-sort:alerts:${secret}`),
  );

  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(
  plaintext: string,
  context: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(context),
    },
    key,
    encoder.encode(plaintext),
  );

  return [
    VERSION,
    base64UrlEncode(iv),
    base64UrlEncode(new Uint8Array(encrypted)),
  ].join(".");
}

export async function decryptSecret(
  ciphertext: string,
  context: string,
) {
  const [version, ivValue, payloadValue, extra] = ciphertext.split(".");
  if (
    version !== VERSION ||
    !ivValue ||
    !payloadValue ||
    extra !== undefined
  ) {
    throw new Error("Encrypted secret format is invalid.");
  }

  const key = await encryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlDecode(ivValue),
      additionalData: encoder.encode(context),
    },
    key,
    base64UrlDecode(payloadValue),
  );

  return decoder.decode(decrypted);
}
