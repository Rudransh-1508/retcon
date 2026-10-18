export function date(iso: unknown) {
  return typeof iso === 'string' ? iso.slice(0, 10) : ''
}

export function month(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso.slice(0, 7) : d.toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
