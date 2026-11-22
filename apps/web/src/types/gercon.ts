import type { NormalizedStatus } from '../../../../packages/gercon-domain'

export type { GerconYear, NormalizedStatus } from '../../../../packages/gercon-domain'

export type DataScope = 'poa' | 'rs'

export type TimeGranularity = 'weekly' | 'monthly'

export type HeatmapDimension = 'especialidade' | 'risco' | 'mes'

export type WaitTimeScope = 'atendidas' | 'todas'

export interface DashboardFilters {
  especialidade: string
  municipio: string
  statuses: NormalizedStatus[]
  classificacaoRisco: string
  dataInicio: string
  dataFim: string
  granularity: TimeGranularity
  heatmapDimension: HeatmapDimension
  waitTimeScope: WaitTimeScope
  topUnitsLimit: number
}

export interface FilterOptions {
  especialidades: string[]
  municipios: string[]
  classificacoesRisco: string[]
  minDate: string
  maxDate: string
}

export interface KpiSummary {
  total: number
  aguardando: number
  agendado: number
  atendido: number
  cancelado: number
  devolvido: number
  taxaAtendimento: number
  taxaAguardando: number
  medianaEspera: number | null
  p90Espera: number | null
  mediaEspera: number | null
  especialidadesAtivas: number
  unidadesExecutantesAtivas: number
}

export interface StatusByUnitRow {
  unit: string
  total: number
  counts: Record<NormalizedStatus, number>
}

export interface TimeSeriesDataset {
  label: string
  values: number[]
}

export interface TimeSeriesData {
  labels: string[]
  totalSeries: number[]
  topSpecialties: TimeSeriesDataset[]
}

export interface HeatmapCell {
  row: string
  col: string
  value: number
}

export interface HeatmapData {
  rows: string[]
  cols: string[]
  cells: HeatmapCell[]
  maxValue: number
  totalPending: number
  dimensionLabel: string
}

export interface WaitTimeBucket {
  label: string
  shortLabel: string
  count: number
  percentage: number
}

export interface WaitTimeHistogramData {
  buckets: WaitTimeBucket[]
  sampleCount: number
  median: number | null
  p90: number | null
  p95: number | null
  mean: number | null
  max: number | null
}

export interface AggregatedDashboardData {
  kpis: KpiSummary
  statusByUnit: StatusByUnitRow[]
  timeSeries: TimeSeriesData
  heatmap: HeatmapData
  waitTimeHistogram: WaitTimeHistogramData
  computeTimeMs: number
}
