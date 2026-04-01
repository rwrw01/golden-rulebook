export function extractMemo(messages: string[]): string | null {
  const full = messages.join('\n');

  const memoPatterns = [
    /## Investment [Mm]emo[\s\S]*/,
    /\*\*Investment [Mm]emo\*\*[\s\S]*/,
    /# Investment [Mm]emo[\s\S]*/,
    /\*\*Mode used\*\*[\s\S]*/,
    /\*\*Verdict\*\*[\s\S]*/,
  ];

  for (const pattern of memoPatterns) {
    const match = full.match(pattern);
    if (match) return match[0];
  }

  return full.length > 0 ? full : null;
}
