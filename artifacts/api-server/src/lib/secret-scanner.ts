const CREDENTIAL_TOKEN_PATTERNS = [
  /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/i,
  /\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/i,
  /\bAIza[0-9A-Za-z_-]{30,}\b/i,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
];

const ASSIGNED_SECRET_PATTERN =
  /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|private[_-]?key|secret)\b\s*[:=]\s*(['"`]?)([^\s'"`,;)}]{8,})/gi;

export function containsLikelySecret(text: string): boolean {
  if (CREDENTIAL_TOKEN_PATTERNS.some((pattern) => pattern.test(text))) return true;
  ASSIGNED_SECRET_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(ASSIGNED_SECRET_PATTERN)) {
    const value = match[2]?.toLowerCase() ?? "";
    if (
      value.startsWith("process.env.") ||
      value.startsWith("import.meta.env.") ||
      value.startsWith("your_") ||
      value.startsWith("replace_") ||
      value.includes("placeholder")
    ) {
      continue;
    }
    return true;
  }
  return false;
}

export function redactLikelySecrets(text: string): string {
  let redacted = text;
  for (const pattern of CREDENTIAL_TOKEN_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  ASSIGNED_SECRET_PATTERN.lastIndex = 0;
  redacted = redacted.replace(
    ASSIGNED_SECRET_PATTERN,
    (match, _quote: string, value: string) => {
      if (
        value.toLowerCase().startsWith("process.env.") ||
        value.toLowerCase().startsWith("import.meta.env.") ||
        value.toLowerCase().startsWith("your_") ||
        value.toLowerCase().startsWith("replace_") ||
        value.toLowerCase().includes("placeholder")
      ) {
        return match;
      }
      return match.slice(0, match.indexOf(value)) + "[REDACTED]";
    },
  );
  return redacted;
}
