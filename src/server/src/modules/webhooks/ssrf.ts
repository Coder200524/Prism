import dns from "node:dns/promises";
import net from "node:net";

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
    // 0.0.0.0
    if (ip === "0.0.0.0") return true;

    return false;
  }

  // IPv6 checks
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // Link-local (fe80::/10) - ALWAYS blocked
    if (lower.startsWith("fe80:") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
      return true;
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

export async function validateWebhookUrl(
  urlStr: string,
  allowPrivate = process.env.WEBHOOKS_ALLOW_PRIVATE === "true",
): Promise<{ allowed: boolean; reason?: string; ip?: string }> {
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
      return { allowed: false, reason: `IP address ${hostname} is blocked (SSRF protection)`, ip: hostname };
    }
    return { allowed: true, ip: hostname };
  }

  // Resolve hostname via DNS
  try {
    const addresses = await dns.resolve(hostname);
    if (!addresses || addresses.length === 0) {
      return { allowed: false, reason: "Hostname could not be resolved" };
    }

    for (const ip of addresses) {
      if (isPrivateOrLoopbackIp(ip, allowPrivate)) {
        return { allowed: false, reason: `Resolved IP ${ip} for ${hostname} is blocked (SSRF protection)`, ip };
      }
    }

    return { allowed: true, ip: addresses[0] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { allowed: false, reason: `DNS resolution failed: ${message}` };
  }
}
