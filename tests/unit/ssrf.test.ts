import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  isPrivateOrLoopbackIp,
  safeWebhookFetch,
  setDnsResolveForTests,
  validateWebhookUrl,
} from "../../src/server/src/modules/webhooks/ssrf.js";

describe("webhook SSRF protections", () => {
  afterEach(() => {
    setDnsResolveForTests(null);
    delete process.env.WEBHOOKS_ALLOW_PRIVATE;
  });

  it("blocks localhost, private IPv4, private IPv6, and link-local", async () => {
    delete process.env.WEBHOOKS_ALLOW_PRIVATE;

    expect(isPrivateOrLoopbackIp("127.0.0.1", false)).toBe(true);
    expect(isPrivateOrLoopbackIp("10.0.0.5", false)).toBe(true);
    expect(isPrivateOrLoopbackIp("192.168.1.10", false)).toBe(true);
    expect(isPrivateOrLoopbackIp("169.254.169.254", false)).toBe(true);
    expect(isPrivateOrLoopbackIp("::1", false)).toBe(true);
    expect(isPrivateOrLoopbackIp("fd12::1", false)).toBe(true);
    expect(isPrivateOrLoopbackIp("fe80::1", false)).toBe(true);
    expect(isPrivateOrLoopbackIp("8.8.8.8", false)).toBe(false);

    expect((await validateWebhookUrl("http://127.0.0.1/hook")).allowed).toBe(false);
    expect((await validateWebhookUrl("http://192.168.0.1/hook")).allowed).toBe(false);
    expect((await validateWebhookUrl("http://[::1]/hook")).allowed).toBe(false);
    expect((await validateWebhookUrl("http://[fd00::1]/hook")).allowed).toBe(false);
    expect((await validateWebhookUrl("http://localhost/hook")).allowed).toBe(false);
    expect((await validateWebhookUrl("http://8.8.8.8/hook")).allowed).toBe(true);
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    delete process.env.WEBHOOKS_ALLOW_PRIVATE;
    setDnsResolveForTests(async () => ["10.1.2.3"]);

    const result = await validateWebhookUrl("https://evil.example/webhook");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/10\.1\.2\.3/);
  });

  it("allows hostnames that resolve only to public addresses", async () => {
    delete process.env.WEBHOOKS_ALLOW_PRIVATE;
    setDnsResolveForTests(async () => ["93.184.216.34"]);

    const result = await validateWebhookUrl("https://example.com/webhook");
    expect(result.allowed).toBe(true);
    expect(result.ip).toBe("93.184.216.34");
  });

  it("blocks redirects to private destinations during safe fetch", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
    });

    const port = await new Promise<number>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve((server.address() as { port: number }).port);
      });
    });

    await expect(
      safeWebhookFetch(
        `http://127.0.0.1:${port}/start`,
        { method: "GET" },
        { allowPrivate: true },
      ),
    ).rejects.toThrow(/SSRF blocked on redirect|169\.254/);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("treats a DNS rebound to a private IP as blocked on re-validation", async () => {
    delete process.env.WEBHOOKS_ALLOW_PRIVATE;
    let calls = 0;
    setDnsResolveForTests(async () => {
      calls += 1;
      return calls === 1 ? ["8.8.8.8"] : ["10.0.0.9"];
    });

    const first = await validateWebhookUrl("https://rebinder.example/hook");
    expect(first.allowed).toBe(true);

    const rebound = await validateWebhookUrl("https://rebinder.example/hook");
    expect(rebound.allowed).toBe(false);
    expect(rebound.reason).toMatch(/10\.0\.0\.9/);
  });
});
