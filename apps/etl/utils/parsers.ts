/** Remove espaços e converte string vazia em null. */
export function parseNonEmptyText(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Converte "45" ou "45.0" em 45; devolve null quando vazio ou não numérico. */
export function parseInteger(value: string | undefined): number | null {
  const text = parseNonEmptyText(value)
  if (text === null) return null
  const number = Number(text)
  return Number.isFinite(number) ? Math.round(number) : null
}

/** Aceita "2025/02/07 00:00:00.000" e "2025-02-07 00:00:00" e devolve "2025-02-07". */
export function parseIsoDate(value: string | undefined): string | null {
  const datePart = parseNonEmptyText(value)?.slice(0, 10).replaceAll('/', '-')
  return datePart && /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null
}
