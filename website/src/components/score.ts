/** The colour of a combo's rating: green from 8.5, then lime, yellow, orange and red. */
export function scoreColor(score: number): string {
  if (score >= 8.5) return '#00DE12' // brand green
  if (score >= 6.5) return '#84cc16' // lime
  if (score >= 5) return '#eab308' // yellow
  if (score >= 3.5) return '#f97316' // orange
  return '#ef4444' // red
}
