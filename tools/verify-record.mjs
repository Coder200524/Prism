/* global console, process, Buffer */
import fs from "node:fs";
import crypto from "node:crypto";

function canonicalize(val) {
  if (val === null || typeof val !== "object") {
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    return "[" + val.map((item) => canonicalize(item)).join(",") + "]";
  }

  const sortedKeys = Object.keys(val).sort();
  const entries = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalize(val[key])}`,
  );
  return "{" + entries.join(",") + "}";
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      "Usage: node tools/verify-record.mjs record.json public-keys.json",
    );
    process.exit(1);
  }

  const [recordFile, keysFile] = args;

  let recordData, keysData;
  try {
    recordData = JSON.parse(fs.readFileSync(recordFile, "utf8"));
  } catch (err) {
    console.log(`INVALID: Could not parse record JSON: ${err.message}`);
    process.exit(1);
  }

  try {
    keysData = JSON.parse(fs.readFileSync(keysFile, "utf8"));
  } catch (err) {
    console.log(`INVALID: Could not parse public keys JSON: ${err.message}`);
    process.exit(1);
  }

  const record = recordData.record || recordData;
  const keys = Array.isArray(keysData.keys)
    ? keysData.keys
    : Array.isArray(keysData)
      ? keysData
      : [keysData];

  if (!record || !record.payload || !record.signature || !record.kid) {
    console.log("INVALID: Record is missing payload, signature, or kid");
    process.exit(1);
  }

  if (record.revokedAt) {
    console.log(
      `INVALID: Record was revoked at ${record.revokedAt}. Reason: ${record.revokedReason || "None"}`,
    );
    process.exit(1);
  }

  const matchingKey = keys.find(
    (k) => k.kid === record.kid || k.id === record.kid,
  );
  if (!matchingKey || !matchingKey.publicKey) {
    console.log(`INVALID: Public key not found for kid: ${record.kid}`);
    process.exit(1);
  }

  const canonicalJson = canonicalize(record.payload);
  const computedHash = crypto
    .createHash("sha256")
    .update(canonicalJson, "utf8")
    .digest("hex");

  if (record.payloadHash && record.payloadHash !== computedHash) {
    console.log(
      `INVALID: Payload hash mismatch. Expected ${record.payloadHash}, computed ${computedHash}`,
    );
    process.exit(1);
  }

  try {
    const signatureBuf = Buffer.from(record.signature, "base64url");
    const valid = crypto.verify(
      null,
      Buffer.from(canonicalJson, "utf8"),
      matchingKey.publicKey,
      signatureBuf,
    );

    if (valid) {
      console.log("VALID");
      process.exit(0);
    } else {
      console.log("INVALID: Signature verification failed");
      process.exit(1);
    }
  } catch (err) {
    console.log(`INVALID: Signature verification error: ${err.message}`);
    process.exit(1);
  }
}

main();
