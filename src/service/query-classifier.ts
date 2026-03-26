export type QueryIntent = 'actors' | 'processes' | 'infra' | 'impact' | 'communication' | 'general';

export type QueryClassification = {
  intents: QueryIntent[];
  systemNames: string[];
};

// Known multi-word system names (checked before single-word extraction)
const KNOWN_MULTI_WORD_SYSTEMS: string[] = [
  'neuron esb',
  'civision berichtenmodule',
  'mijn overheid',
  'book and park',
];

// Dutch stop words — must not be extracted as system names
const STOP_WORDS = new Set([
  'een', 'het', 'van', 'met', 'bij', 'heb', 'ik', 'in', 'de', 'is', 'er',
  'dat', 'die', 'voor', 'naar', 'aan', 'uit', 'op', 'om', 'als', 'dan',
  'maar', 'wat', 'wie', 'waar', 'hoe', 'wel', 'niet', 'nog', 'ook', 'kan',
  'kun', 'moet', 'mag', 'wil', 'zal', 'zou', 'deze', 'dit', 'over',
  'hebben', 'zijn', 'worden', 'maken', 'kijken', 'moeten', 'informeren',
  'hoeveel', 'waarom', 'wanneer', 'waarmee', 'waarin', 'waaruit', 'bericht',
  'intranet', 'gebruikers', 'storing', 'systeem', 'applicatie', 'server',
  'processen', 'welke', 'impact', 'geraakt',
]);

// Intent detection patterns (case-insensitive)
const INTENT_PATTERNS: Array<{ intent: QueryIntent; pattern: RegExp }> = [
  {
    intent: 'actors',
    pattern: /wie\s+(moet|moeten|informer|waarschuw|bellen)|te\s+informeren|op\s+de\s+hoogte|informeren|bellen/i,
  },
  {
    intent: 'processes',
    pattern: /welke\s+processen|bedrijfsproces|processen\s+(geraakt|getroffen)/i,
  },
  {
    intent: 'infra',
    pattern: /waar\s+draait|welke\s+servers?|welke\s+nodes?|database|waar\s+moet\s+ik\s+kijken/i,
  },
  {
    intent: 'impact',
    pattern: /wat\s+is\s+de\s+impact|storing|uitval|plat|down/i,
  },
  {
    intent: 'communication',
    pattern: /bericht|melding|intranet|communicat|mail/i,
  },
];

/**
 * Extracts multi-word known system names from the query.
 * @param lower - Lowercased query string
 * @returns Array of matched multi-word system names
 */
function extractMultiWordSystems(lower: string): string[] {
  return KNOWN_MULTI_WORD_SYSTEMS.filter((name) => lower.includes(name));
}

/**
 * Extracts single-word capitalized system names / acronyms not in stop words.
 * @param query - Original (cased) query string
 * @param consumed - Ranges of the string already claimed by multi-word matches
 * @returns Array of lowercase single-word system names
 */
function extractSingleWordSystems(query: string, consumed: string[]): string[] {
  // Remove already-found multi-word systems from the lowercase version for matching
  let remaining = query;
  for (const name of consumed) {
    // Replace case-insensitively to remove from remaining text
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    remaining = remaining.replace(new RegExp(escaped, 'gi'), ' '.repeat(name.length));
  }

  // Match words that start with uppercase (A-Z) or are full acronyms (2+ uppercase letters)
  const candidates = remaining.match(/\b[A-Z][a-zA-Z0-9]*\b/g) ?? [];

  const results: string[] = [];
  for (const word of candidates) {
    const lower = word.toLowerCase();
    if (!STOP_WORDS.has(lower) && lower.length > 1) {
      results.push(lower);
    }
  }
  return [...new Set(results)];
}

/**
 * Detects intents present in the query, defaulting to 'general' if none match.
 * @param query - The user's question
 * @returns Array of matched QueryIntent values
 */
function detectIntents(query: string): QueryIntent[] {
  const matched = INTENT_PATTERNS
    .filter(({ pattern }) => pattern.test(query))
    .map(({ intent }) => intent);

  return matched.length > 0 ? matched : ['general'];
}

/**
 * Classifies a Dutch user question into intents and system names.
 * @param query - The user's question in Dutch
 * @returns QueryClassification with intents and systemNames
 */
export function classifyQuery(query: string): QueryClassification {
  const lower = query.toLowerCase();

  const multiWord = extractMultiWordSystems(lower);
  const singleWord = extractSingleWordSystems(query, multiWord);

  const systemNames = [...new Set([...multiWord, ...singleWord])];
  const intents = detectIntents(query);

  return { intents, systemNames };
}
