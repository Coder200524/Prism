import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { LookupFunction } from "node:net";

export function isPrivateOrLoopbackIp(ip: string, allowPrivate: boolean): boolean {
  if (!net.isIP(ip)) return true;

  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const p0 = parts[0] ?? 0;
    const p1 = parts[1] ?? 0;

    // Link-local / Cloud metadata (169.254.0.0/16) - ALWAYS blocked
    if (p0 === 169 && p1 === 254) {
      return true;
    }

    if (allowPrivate) {
      return false;
    }

    // Loopback 127.0.0.0/8
    if (p0 === 127) return true;
    // 10.0.0.0/8
    if (p0 === 10) return true;
    // 172.16.0.0/12
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
    // 192.168.0.0/16
    if (p0 === 192 && p1 === 168) return true;
    // CGNAT 100.64.0.0/10
    if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;
    // 0.0.0.0
    if (ip === "0.0.0.0") return true;

    return false;
  }

  // IPv6 checks
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // Link-local (fe80::/10) - ALWAYS blocked
    if (
      lower.startsWith("fe80:") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb")
    ) {
      return true;
    }

    // IPv4-mapped IPv6
    if (lower.startsWith("::ffff:")) {
      const mapped = lower.slice("::ffff:".length);
      if (net.isIPv4(mapped)) {
        return isPrivateOrLoopbackIp(mapped, allowPrivate);
      }
    }

    if (allowPrivate) {
      return false;
    }

    // Loopback ::1
    if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
    // Unique local address (fc00::/7)
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;

    return false;
  }

  return true;
}

export type WebhookUrlValidation = {
  allowed: boolean;
  reason?: string;
  ip?: string;
  ips?: string[];
};

/** Injectable for unit tests — production uses real DNS A/AAAA lookups. */
export type DnsResolveFn = (hostname: string) => Promise<string[]>;

export const defaultDnsResolve: DnsResolveFn = async (hostname) => {
  const [v4, v6] = await Promise.all([
    dns.resolve4(hostname).catch(() => [] as string[]),
    dns.resolve6(hostname).catch(() => [] as string[]),
  ]);
  return [...v4, ...v6];
};

let dnsResolveImpl: DnsResolveFn = defaultDnsResolve;

/** Test-only: swap the DNS resolver used by validateWebhookUrl / safeWebhookFetch. */
export function setDnsResolveForTests(fn: DnsResolveFn | null): void {
  dnsResolveImpl = fn ?? defaultDnsResolve;
}

export async function validateWebhookUrl(
  urlStr: string,
  allowPrivate = process.env.WEBHOOKS_ALLOW_PRIVATE === "true",
): Promise<WebhookUrlValidation> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { allowed: false, reason: "Invalid URL syntax" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: "Only http and https protocols are allowed" };
  }

  const hostname = parsed.hostname;

  // Direct IP address check
  if (net.isIP(hostname)) {
    if (isPrivateOrLoopbackIp(hostname, allowPrivate)) {
      return {
        allowed: false,
        reason: `IP address ${hostname} is blocked (SSRF protection)`,
        ip: hostname,
      };
    }
    return { allowed: true, ip: hostname, ips: [hostname] };
  }

  // Block obvious local hostnames without relying on DNS alone
  const hostLower = hostname.toLowerCase();
  if (
    !allowPrivate &&
    (hostLower === "localhost" ||
      hostLower.endsWith(".localhost") ||
      hostLower.endsWith(".local") ||
      hostLower.endsWith(".internal"))
  ) {
    return { allowed: false, reason: `Hostname ${hostname} is blocked (SSRF protection)` };
  }

  try {
    const addresses = await dnsResolveImpl(hostname);
    if (!addresses || addresses.length === 0) {
      return { allowed: false, reason: "Hostname could not be resolved" };
    }

    for (const ip of addresses) {
      if (isPrivateOrLoopbackIp(ip, allowPrivate)) {
        return {
          allowed: false,
          reason: `Resolved IP ${ip} for ${hostname} is blocked (SSRF protection)`,
          ip,
        };
      }
    }

    return { allowed: true, ip: addresses[0], ips: addresses };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { allowed: false, reason: `DNS resolution failed: ${message}` };
  }
}

function pinnedLookup(pinnedIp: string): LookupFunction {
  const family = net.isIPv6(pinnedIp) ? 6 : 4;
  return (_hostname, options, callback) => {
    const cb =
      typeof options === "function"
        ? options
        : (callback as (err: NodeJS.ErrnoException | null, address: string, family: number) => void);
    cb(null, pinnedIp, family);
  };
}

/**
 * Fetch a webhook URL with DNS pinning to prevent rebinding between
 * validation and connect. Redirect destinations are re-validated.
 */
export async function safeWebhookFetch(
  urlStr: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
  options?: {
    allowPrivate?: boolean;
    maxRedirects?: number;
    pinnedIp?: string;
  },
): Promise<Response> {
  const allowPrivate =
    options?.allowPrivate ?? process.env.WEBHOOKS_ALLOW_PRIVATE === "true";
  const maxRedirects = options?.maxRedirects ?? 3;

  const validation = await validateWebhookUrl(urlStr, allowPrivate);
  if (!validation.allowed || !validation.ip) {
    throw new Error(`SSRF blocked: ${validation.reason ?? "URL not allowed"}`);
  }

  const pinnedIp = options?.pinnedIp ?? validation.ip;
  const parsed = new URL(urlStr);
  const isHttps = parsed.protocol === "https:";
  const lib = isHttps ? https : http;
  const agent = new lib.Agent({
    lookup: pinnedLookup(pinnedIp),
  });

  const response = await new Promise<{
    status: number;
    statusText: string;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
  }>((resolve, reject) => {
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: init.method ?? "GET",
        headers: {
          ...init.headers,
          Host: parsed.host,
        },
        agent,
        signal: init.signal,
        servername: isHttps ? parsed.hostname : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? "",
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });

  if (
    response.status >= 300 &&
    response.status < 400 &&
    typeof response.headers.location === "string"
  ) {
    if (maxRedirects <= 0) {
      throw new Error("SSRF blocked: too many redirects");
    }
    const nextUrl = new URL(response.headers.location, urlStr).toString();
    const nextValidation = await validateWebhookUrl(nextUrl, allowPrivate);
    if (!nextValidation.allowed || !nextValidation.ip) {
      throw new Error(
        `SSRF blocked on redirect: ${nextValidation.reason ?? "destination not allowed"}`,
      );
    }
    return safeWebhookFetch(nextUrl, init, {
      allowPrivate,
      maxRedirects: maxRedirects - 1,
      pinnedIp: nextValidation.ip,
    });
  }

  const headerMap = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headerMap.append(key, item);
    } else {
      headerMap.set(key, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headerMap,
  });
}
