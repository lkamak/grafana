import { type LogRowModel } from '@grafana/data';

export interface LogPattern {
  id: string;
  label: string;
  count: number;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_TIME = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const HEX = /\b[0-9a-f]{8,}\b/gi;
const NUMBER = /\d+(?:\.\d+)?/g;

export const MAX_LOG_PATTERNS = 8;
const MAX_PATTERN_LABEL = 48;

export function normalizeLogPattern(entry: string): string {
  return entry
    .replace(UUID, '*')
    .replace(ISO_TIME, '*')
    .replace(IPV4, '*')
    .replace(HEX, '*')
    .replace(NUMBER, '*')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shortenPatternLabel(pattern: string, max = MAX_PATTERN_LABEL): string {
  return pattern.length > max ? `${pattern.slice(0, max - 1)}…` : pattern;
}

export function getTopLogPatterns(rows: LogRowModel[], limit = MAX_LOG_PATTERNS): LogPattern[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const key = normalizeLogPattern(row.entry);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([pattern, count]) => ({
      id: pattern,
      label: shortenPatternLabel(pattern),
      count,
    }));
}

export function rowMatchesPattern(row: LogRowModel, patternId: string): boolean {
  return normalizeLogPattern(row.entry) === patternId;
}
