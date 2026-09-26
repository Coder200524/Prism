/** Only allow same-app relative paths; reject protocol-relative and absolute URLs. */
export function safeReturnPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  const pathOnly = value.split("?")[0] ?? value;
  if (pathOnly === "/login" || pathOnly === "/register") return fallback;
  return value;
}
