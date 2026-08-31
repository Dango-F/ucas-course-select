export function transcriptTermOrder(term: string): number {
  if (term.includes('(秋)')) return 0
  if (term.includes('(春)')) return 1
  return 2
}
