import type { NormalizedStatus } from '../../../../packages/gercon-domain'

export const ALL_STATUSES: NormalizedStatus[] = [
  'Aguardando',
  'Agendado',
  'Atendido',
  'Cancelado',
  'Devolvido',
]

/**
 * Paleta segura para daltônicos (Okabe-Ito) — garante contraste e distinção
 * em protanopia, deuteranopia e tritanopia.
 */
export const STATUS_COLORS: Record<NormalizedStatus, string> = {
  Atendido: '#0072B2', // Azul forte
  Agendado: '#009E73', // Verde azulado
  Aguardando: '#E69F00', // Laranja âmbar
  Cancelado: '#D55E00', // Vermelho-alaranjado (vermilion)
  Devolvido: '#CC79A7', // Lilás / púrpura rosado
}

export const STATUS_BG_SOFT: Record<NormalizedStatus, string> = {
  Atendido: 'rgba(0, 114, 178, 0.12)',
  Agendado: 'rgba(0, 158, 115, 0.12)',
  Aguardando: 'rgba(230, 159, 0, 0.15)',
  Cancelado: 'rgba(213, 94, 0, 0.12)',
  Devolvido: 'rgba(204, 121, 167, 0.14)',
}

/**
 * Paleta segura para múltiplas séries temporais (Okabe-Ito estendida)
 */
export const SERIES_COLORS = [
  '#0072B2',
  '#D55E00',
  '#009E73',
  '#CC79A7',
  '#E69F00',
  '#56B4E9',
]

/**
 * Paleta sequencial acessível para histograma de tempo de espera
 */
export const HISTOGRAM_COLORS = [
  '#0072B2',
  '#1F8AC0',
  '#56B4E9',
  '#009E73',
  '#E69F00',
  '#E07A00',
  '#D55E00',
  '#8B2D00',
]
