import { describe, expect, it, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { getTestApp, resetDatabase, createUser } from "../helpers/index.js";

describe("api/auth", () => {
  const app = getTestApp();

  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    delete process.env.TEST_RATE_LIMIT;
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad json}");
    
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("rate limits login and cannot be bypassed with X-Forwarded-For when trust proxy is off", async () => {
    process.env.TEST_RATE_LIMIT = "1";
    // Generate 10 failed login attempts
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: `bad${i}@example.com`, password: "password123" });
      expect(res.status).toBe(401);
    }

    // 11th attempt should be rate limited
    const res11 = await request(app)
      .post("/api/auth/login")
      .send({ email: "bad11@example.com", password: "password123" });
    expect(res11.status).toBe(429);

    // 12th attempt with spoofed IP should still be rate limited
    const res12 = await request(app)
      .post("/api/auth/login")
      .set("X-Forwarded-For", "10.0.0.1")
      .send({ email: "bad12@example.com", password: "password123" });
    expect(res12.status).toBe(429);
  });
});
