/**
 * Guard for `callbackUrl`-style parameters: only same-origin absolute paths
 * are honoured, so a crafted link can never bounce a user to another site.
 */
export function safeInternalPath(candidate: string | null | undefined, fallback = '/dashboard'): string {
  if (!candidate) return fallback
  // Must be a root-relative path: "/x" but not "//evil.com", "/\evil.com" or "http://…".
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback
  if (/[\r\n]/.test(candidate)) return fallback
  return candidate
}
