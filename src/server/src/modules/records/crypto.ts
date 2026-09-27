import crypto from "node:crypto";

export function canonicalize(val: unknown): string {
  if (val === null || typeof val !== "object") {
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    return "[" + val.map((item) => canonicalize(item)).join(",") + "]";
  }

  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`,
  );
  return "{" + entries.join(",") + "}";
}

function getSecretKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptPrivateKey(privateKeyPem: string, secret: string): string {
  const key = getSecretKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(privateKeyPem, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptPrivateKey(encryptedData: string, secret: string): string {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted private key format");
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Invalid encrypted private key parts");
  }
  const key = getSecretKey(secret);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function generateEd25519KeyPair(): {
  publicKeyPem: string;
  privateKeyPem: string;
} {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  return {
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
  };
}

export function hashPayload(canonicalJson: string): string {
  return crypto.createHash("sha256").update(canonicalJson, "utf8").digest("hex");
}

export function signCanonicalPayload(
  canonicalJson: string,
  privateKeyPem: string,
): string {
  const signature = crypto.sign(
    null,
    Buffer.from(canonicalJson, "utf8"),
    privateKeyPem,
  );
  return signature.toString("base64url");
}

export function verifyCanonicalPayload(
  canonicalJson: string,
  signatureBase64Url: string,
  publicKeyPem: string,
): boolean {
  try {
    const signature = Buffer.from(signatureBase64Url, "base64url");
    return crypto.verify(
      null,
      Buffer.from(canonicalJson, "utf8"),
      publicKeyPem,
      signature,
    );
  } catch {
    return false;
  }
}
