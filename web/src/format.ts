export function date(iso: unknown) {
  return typeof iso === 'string' ? iso.slice(0, 10) : ''
}
