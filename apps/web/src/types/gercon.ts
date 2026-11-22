import type { GerconYear, NormalizedStatus } from '../../../../packages/gercon-domain'

export type { GerconYear, NormalizedStatus } from '../../../../packages/gercon-domain'

export type DataScope = 'poa' | 'rs'

export type TimeGranularity = 'weekly' | 'monthly'

export type HeatmapDimension = 'especialidade' | 'risco' | 'mes'

export type WaitTimeScope = 'atendidas' | 'todas'

/**
 * Payload bruto retornado pela API CKAN (datastore_search_sql)
 * Recurso GERCON 2025: c0ed7103-fcbd-438e-a0c6-dd030248a1e0
 */
export interface RawGerconRecord {
  _id: number
  data_extracao?: string | null
  data_solicitacao: string | null
  datahora_consulta: string | null
  diasfilaespera: number | string | null
  especialidade: string | null
  especialidademae?: string | null
  cid: string | null
  corregulador: string | null
  municipio_residencia: string | null
  unidadesolicitante: string | null
  unidadeexecutante: string | null
  situacaosolicitacao: string | null
}

export interface CkanSqlResponse {
  success: boolean
  result: {
    records: RawGerconRecord[]
    fields?: Array<{ id: string; type: string }>
    sql?: string
  }
  error?: {
    message?: string
    __type?: string
  }
}

/**
 * Registro normalizado armazenado no navegador (IndexedDB) e consumido pelo Web Worker.
 * Segue o esquema clínico/localização/rastreamento definido no projeto GERCON.
 */
export interface GerconRecord {
  _id: number
  data_solicitacao: string // YYYY-MM-DD
  data_agendamento: string | null // YYYY-MM-DD (datahora_consulta)
  especialidade: string
  especialidade_mae: string
  cid: string
  classificacao_risco: string
  municipio_residencia: string
  unidade_solicitante: string
  unidade_executante: string
  status_bruto: string
  status: NormalizedStatus
  dias_espera: number | null
}

export interface CacheMetadata {
  version: number
  resourceId: string
  year: GerconYear
  scope: DataScope
  recordCount: number
  downloadedAt: string
  dataExtracao: string | null
}

export interface DownloadProgress {
  fetched: number
  target: number
  batch: number
  totalBatches: number
  message: string
}

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

export type WorkerInMessage =
  | { type: 'LOAD_DATA'; records: GerconRecord[] }
  | { type: 'AGGREGATE'; filters: DashboardFilters }

export type WorkerOutMessage =
  | { type: 'DATA_LOADED'; count: number; options: FilterOptions }
  | { type: 'AGGREGATED'; data: AggregatedDashboardData }
  | { type: 'ERROR'; message: string }
