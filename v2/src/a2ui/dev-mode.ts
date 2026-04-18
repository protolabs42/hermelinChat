export function isA2UIDevMode(search: string): boolean {
  return new URLSearchParams(search).has('a2ui-dev')
}
