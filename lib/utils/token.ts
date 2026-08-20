/**
 * Generate a 6-digit numeric code (used for email verification and password reset).
 */
export function generateSixDigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
