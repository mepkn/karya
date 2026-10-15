/** Parses the comma-separated ALLOWED_EMAILS env var into normalized emails. */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function isAllowedEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.trim().toLowerCase());
}
