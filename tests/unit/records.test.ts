import { describe, expect, it } from "vitest";
import {
  canonicalize,
  decryptPrivateKey,
  encryptPrivateKey,
  generateEd25519KeyPair,
  hashPayload,
  signCanonicalPayload,
  verifyCanonicalPayload,
} from "../../src/server/src/modules/records/crypto.js";

describe("Records Cryptography & Canonicalization Unit Tests", () => {
  it("canonicalizes JSON deterministically regardless of key order", () => {
    const objA = { b: 2, a: 1, c: { z: 26, y: 25 } };
    const objB = { a: 1, c: { y: 25, z: 26 }, b: 2 };

    const canonA = canonicalize(objA);
    const canonB = canonicalize(objB);

    expect(canonA).toBe(canonB);
    expect(canonA).toBe('{"a":1,"b":2,"c":{"y":25,"z":26}}');
  });

  it("encrypts and decrypts private keys securely using AES-256-GCM", () => {
    const { privateKeyPem } = generateEd25519KeyPair();
    const secret = "test-secret-key-32-bytes-long!!";

    const encrypted = encryptPrivateKey(privateKeyPem, secret);
    expect(encrypted).toContain(":");

    const decrypted = decryptPrivateKey(encrypted, secret);
    expect(decrypted).toBe(privateKeyPem);
  });

  it("signs and verifies canonical payloads using Ed25519", () => {
    const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
    const payload = { eventId: "evt_01", judge: "Judge Alpha", reviews: 5 };
    const canon = canonicalize(payload);

    const signature = signCanonicalPayload(canon, privateKeyPem);
    const valid = verifyCanonicalPayload(canon, signature, publicKeyPem);

    expect(valid).toBe(true);
  });

  it("fails verification when payload is tampered with", () => {
    const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
    const payload = { eventId: "evt_01", judge: "Judge Alpha", reviews: 5 };
    const canon = canonicalize(payload);

    const signature = signCanonicalPayload(canon, privateKeyPem);

    const tamperedPayload = { eventId: "evt_01", judge: "Judge Alpha", reviews: 99 };
    const tamperedCanon = canonicalize(tamperedPayload);

    const valid = verifyCanonicalPayload(tamperedCanon, signature, publicKeyPem);
    expect(valid).toBe(false);
  });

  it("fails verification when wrong public key is used", () => {
    const pair1 = generateEd25519KeyPair();
    const pair2 = generateEd25519KeyPair();

    const payload = { eventId: "evt_01", judge: "Judge Alpha" };
    const canon = canonicalize(payload);

    const signature = signCanonicalPayload(canon, pair1.privateKeyPem);
    const valid = verifyCanonicalPayload(canon, signature, pair2.publicKeyPem);

    expect(valid).toBe(false);
  });

  it("computes matching sha256 hash of canonical payload", () => {
    const payload = { id: "rec_1", type: "judge_participation" };
    const canon = canonicalize(payload);
    const hash = hashPayload(canon);

    expect(hash).toHaveLength(64);
  });
});
