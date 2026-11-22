export type NormalizedStatus =
  | 'Aguardando'
  | 'Agendado'
  | 'Atendido'
  | 'Cancelado'
  | 'Devolvido'

export type GerconYear = 2026 | 2025 | 2024 | 2023 | 2022 | 2021 | 2020 | 2019 | 2018 | 2017

export const AVAILABLE_YEARS: GerconYear[] = [
  2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017,
]

export const GERCON_RESOURCES_BY_YEAR: Record<GerconYear, string> = {
  2026: '518effb3-f598-4d06-afa4-dec06c2a41bf',
  2025: 'c0ed7103-fcbd-438e-a0c6-dd030248a1e0',
  2024: '09e4bc46-a2f2-4f79-83a6-0e1c90efc0b3',
  2023: 'ab48ad6a-846e-4adc-866e-f18c094cd784',
  2022: '8df327bf-3f9f-4a56-a077-74268e127ebc',
  2021: '23d461c2-db71-46bc-896b-8b9b086531d9',
  2020: '705574ea-e447-440c-b2d1-8834030bbac3',
  2019: 'fe2226c6-a63d-496b-9fb8-682f1341ac62',
  2018: '1a3095be-7ff2-426f-87da-9e2acf484396',
  2017: '18d2245c-dd65-41ee-90b3-1b2b1af83976',
}

export function normalizeGerconStatus(raw: string | null | undefined): NormalizedStatus {
  const s = (raw ?? '').trim().toUpperCase()
  if (s === 'REALIZADA' || s === 'ENCERRADA' || s === 'ATENDIDO') {
    return 'Atendido'
  }
  if (s === 'AGENDADA' || s === 'AGENDA_CONFIRMADA' || s === 'AGENDADO') {
    return 'Agendado'
  }
  if (
    s === 'CANCELADA' ||
    s === 'CANCELADA_SEM_REVERSAO' ||
    s === 'CONFIRMACAO_EXPIRADA' ||
    s === 'CANCELADO'
  ) {
    return 'Cancelado'
  }
  if (
    s === 'AGUARDA_REAVALIACAO' ||
    s === 'AGUARDA_REVERSAO' ||
    s === 'DEVOLVIDA' ||
    s === 'DEVOLVIDO'
  ) {
    return 'Devolvido'
  }
  return 'Aguardando'
}

export function normalizeRiskLabel(raw: string | null | undefined): string {
  const val = (raw ?? '').trim().toUpperCase()
  if (!val || val === 'NENHUM' || val === 'NULL') return 'Não classificado'
  const map: Record<string, string> = {
    VERMELHO: 'Vermelho (Urgente)',
    LARANJA: 'Laranja (Muito Urgente)',
    AMARELO: 'Amarelo (Prioritário)',
    VERDE: 'Verde (Pouco Urgente)',
    AZUL: 'Azul (Eletivo)',
  }
  return map[val] ?? val.charAt(0) + val.slice(1).toLowerCase()
}
