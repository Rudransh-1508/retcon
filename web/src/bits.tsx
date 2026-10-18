export function Urgency({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="urgency none">-</span>
  return <span className={`urgency ${value.toLowerCase()}`}>{value}</span>
}

export function Severity({ value }: { value: string | null | undefined }) {
  if (!value) return null
  return <span className={`severity ${value.toLowerCase()}`}>{value.toLowerCase()}</span>
}
