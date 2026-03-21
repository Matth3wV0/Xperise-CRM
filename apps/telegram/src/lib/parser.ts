export interface ParsedMessage {
  companyName: string;
  note: string;
}

/**
 * Parse messages in format: [Company Name] note text
 * Returns null if message doesn't match the pattern.
 * Supports multi-line notes.
 */
export function parseGroupMessage(text: string): ParsedMessage | null {
  const match = text.match(/^\[([^\]]+)\]\s*(.+)$/s);
  if (!match) return null;
  return {
    companyName: match[1].trim(),
    note: match[2].trim(),
  };
}
