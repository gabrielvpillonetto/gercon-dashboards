/// <reference lib="webworker" />

import { ALL_STATUSES, WAIT_TIME_BUCKETS } from '@/constants/palette'
import type {
  AggregatedDashboardData,
  DashboardFilters,
  FilterOptions,
  GerconRecord,
  HeatmapCell,
  HeatmapData,
  KpiSummary,
  NormalizedStatus,
  StatusByUnitRow,
  TimeSeriesData,
  WaitTimeHistogramData,
  WorkerInMessage,
  WorkerOutMessage,
} from '@/types/gercon'

let cachedRecords: GerconRecord[] = []

const MONTH_NAMES = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

function getIsoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${date.getUTCFullYear()}-S${String(weekNo).padStart(2, '0')}`
}

function formatMonthKey(ym: string): string {
  const [y, m] = ym.split('-')
  const idx = Number(m) - 1
  return `${MONTH_NAMES[idx] ?? m}/${y}`
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] !== undefined) {
    return Math.round(sorted[base] + rest * (sorted[base + 1] - sorted[base]))
  }
  return Math.round(sorted[base])
}

function extractFilterOptions(records: GerconRecord[]): FilterOptions {
  const espSet = new Set<string>()
  const munSet = new Set<string>()
  const riskSet = new Set<string>()
  let minDate = '9999-12-31'
  let maxDate = '0000-01-01'

  for (const r of records) {
    espSet.add(r.especialidade)
    munSet.add(r.municipio_residencia)
    riskSet.add(r.classificacao_risco)
    if (r.data_solicitacao < minDate) minDate = r.data_solicitacao
    if (r.data_solicitacao > maxDate) maxDate = r.data_solicitacao
  }

  return {
    especialidades: Array.from(espSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    municipios: Array.from(munSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    classificacoesRisco: Array.from(riskSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    minDate: minDate === '9999-12-31' ? '2025-01-01' : minDate,
    maxDate: maxDate === '0000-01-01' ? '2025-12-31' : maxDate,
  }
}

function aggregate(filters: DashboardFilters): AggregatedDashboardData {
  const t0 = performance.now()

  const statusSet = new Set<NormalizedStatus>(filters.statuses)
  const useStatusFilter = statusSet.size > 0 && statusSet.size < ALL_STATUSES.length

  // Filtered list + accumulators in single pass
  const filtered: GerconRecord[] = []
  const statusTotals: Record<NormalizedStatus, number> = {
    Aguardando: 0,
    Agendado: 0,
    Atendido: 0,
    Cancelado: 0,
    Devolvido: 0,
  }

  const activeEsp = new Set<string>()
  const activeExecUnits = new Set<string>()
  const unitStatusMap = new Map<string, Record<NormalizedStatus, number>>()
  const espTotalMap = new Map<string, number>()
  const waitDaysList: number[] = []
  const kpiWaitDaysList: number[] = []

  for (const r of cachedRecords) {
    if (filters.especialidade && r.especialidade !== filters.especialidade) continue
    if (filters.municipio && r.municipio_residencia !== filters.municipio) continue
    if (filters.classificacaoRisco && r.classificacao_risco !== filters.classificacaoRisco) continue
    if (useStatusFilter && !statusSet.has(r.status)) continue
    if (filters.dataInicio && r.data_solicitacao < filters.dataInicio) continue
    if (filters.dataFim && r.data_solicitacao > filters.dataFim) continue

    filtered.push(r)
    statusTotals[r.status]++
    activeEsp.add(r.especialidade)
    if (r.unidade_executante !== 'Aguardando definição de unidade') {
      activeExecUnits.add(r.unidade_executante)
    }

    espTotalMap.set(r.especialidade, (espTotalMap.get(r.especialidade) ?? 0) + 1)

    let unitCounts = unitStatusMap.get(r.unidade_executante)
    if (!unitCounts) {
      unitCounts = {
        Aguardando: 0,
        Agendado: 0,
        Atendido: 0,
        Cancelado: 0,
        Devolvido: 0,
      }
      unitStatusMap.set(r.unidade_executante, unitCounts)
    }
    unitCounts[r.status]++

    if (r.dias_espera !== null) {
      kpiWaitDaysList.push(r.dias_espera)
      if (filters.waitTimeScope === 'todas' || r.status === 'Atendido') {
        waitDaysList.push(r.dias_espera)
      }
    }
  }

  // 1. KPI Summary
  kpiWaitDaysList.sort((a, b) => a - b)
  const kpiWaitSum = kpiWaitDaysList.reduce((acc, v) => acc + v, 0)
  const total = filtered.length

  const kpis: KpiSummary = {
    total,
    aguardando: statusTotals.Aguardando,
    agendado: statusTotals.Agendado,
    atendido: statusTotals.Atendido,
    cancelado: statusTotals.Cancelado,
    devolvido: statusTotals.Devolvido,
    taxaAtendimento: total > 0 ? (statusTotals.Atendido / total) * 100 : 0,
    taxaAguardando: total > 0 ? (statusTotals.Aguardando / total) * 100 : 0,
    medianaEspera: quantile(kpiWaitDaysList, 0.5),
    p90Espera: quantile(kpiWaitDaysList, 0.9),
    mediaEspera: kpiWaitDaysList.length > 0 ? Math.round(kpiWaitSum / kpiWaitDaysList.length) : null,
    especialidadesAtivas: activeEsp.size,
    unidadesExecutantesAtivas: activeExecUnits.size,
  }

  // 2. Status Proportion by Executing Unit (Top N)
  const statusByUnit: StatusByUnitRow[] = Array.from(unitStatusMap.entries())
    .map(([unit, counts]) => ({
      unit,
      counts,
      total:
        counts.Aguardando +
        counts.Agendado +
        counts.Atendido +
        counts.Cancelado +
        counts.Devolvido,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, filters.topUnitsLimit)

  // 3. Longitudinal Demand Time-Series (Weekly or Monthly + Top 5 Specialties)
  const top5EspNames = Array.from(espTotalMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name)
  const top5Set = new Set(top5EspNames)

  const periodTotalMap = new Map<string, number>()
  const periodEspMap = new Map<string, Map<string, number>>()

  for (const r of filtered) {
    const key =
      filters.granularity === 'weekly'
        ? getIsoWeekKey(r.data_solicitacao)
        : r.data_solicitacao.slice(0, 7)

    periodTotalMap.set(key, (periodTotalMap.get(key) ?? 0) + 1)

    if (top5Set.has(r.especialidade)) {
      let espCounts = periodEspMap.get(key)
      if (!espCounts) {
        espCounts = new Map<string, number>()
        periodEspMap.set(key, espCounts)
      }
      espCounts.set(r.especialidade, (espCounts.get(r.especialidade) ?? 0) + 1)
    }
  }

  const sortedKeys = Array.from(periodTotalMap.keys()).sort()
  const timeSeries: TimeSeriesData = {
    labels: sortedKeys.map((k) =>
      filters.granularity === 'monthly' ? formatMonthKey(k) : k.replace('-', ' ')
    ),
    totalSeries: sortedKeys.map((k) => periodTotalMap.get(k) ?? 0),
    topSpecialties: top5EspNames.map((esp) => ({
      label: esp,
      values: sortedKeys.map((k) => periodEspMap.get(k)?.get(esp) ?? 0),
    })),
  }

  // 4. Operational Pressure Heatmap (Executing Units x Dimension, counting Aguardando)
  // Se muitas solicitações aguardando ainda não têm unidade executante definida,
  // exibimos a unidade executante (ou unidade solicitante quando aplicável no agrupamento).
  const rowTotals = new Map<string, number>()
  const colTotals = new Map<string, number>()
  const cellCounts = new Map<string, number>()
  let totalPending = 0

  const dimensionLabel =
    filters.heatmapDimension === 'especialidade'
      ? 'Especialidade'
      : filters.heatmapDimension === 'risco'
        ? 'Classificação de Risco'
        : 'Mês da Solicitação'

  for (const r of filtered) {
    if (r.status !== 'Aguardando') continue
    totalPending++

    const rowKey =
      r.unidade_executante !== 'Aguardando definição de unidade'
        ? r.unidade_executante
        : `Solicitante: ${r.unidade_solicitante}`

    const colKey =
      filters.heatmapDimension === 'especialidade'
        ? r.especialidade_mae
        : filters.heatmapDimension === 'risco'
          ? r.classificacao_risco
          : formatMonthKey(r.data_solicitacao.slice(0, 7))

    rowTotals.set(rowKey, (rowTotals.get(rowKey) ?? 0) + 1)
    colTotals.set(colKey, (colTotals.get(colKey) ?? 0) + 1)
    const composite = `${rowKey}|||${colKey}`
    cellCounts.set(composite, (cellCounts.get(composite) ?? 0) + 1)
  }

  const topRows = Array.from(rowTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k]) => k)

  const topCols =
    filters.heatmapDimension === 'mes'
      ? Array.from(colTotals.keys()).sort((a, b) => {
          const [ma, ya] = a.split('/')
          const [mb, yb] = b.split('/')
          return Number(ya) * 12 + MONTH_NAMES.indexOf(ma) - (Number(yb) * 12 + MONTH_NAMES.indexOf(mb))
        })
      : Array.from(colTotals.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([k]) => k)

  const cells: HeatmapCell[] = []
  let maxValue = 0
  for (const row of topRows) {
    for (const col of topCols) {
      const val = cellCounts.get(`${row}|||${col}`) ?? 0
      if (val > maxValue) maxValue = val
      cells.push({ row, col, value: val })
    }
  }

  const heatmap: HeatmapData = {
    rows: topRows,
    cols: topCols,
    cells,
    maxValue,
    totalPending,
    dimensionLabel,
  }

  // 5. Wait-time Distribution Histogram
  waitDaysList.sort((a, b) => a - b)
  const bucketCounts = new Array<number>(WAIT_TIME_BUCKETS.length).fill(0)
  let waitSum = 0

  for (const d of waitDaysList) {
    waitSum += d
    for (let i = 0; i < WAIT_TIME_BUCKETS.length; i++) {
      if (d >= WAIT_TIME_BUCKETS[i].min && d <= WAIT_TIME_BUCKETS[i].max) {
        bucketCounts[i]++
        break
      }
    }
  }

  const sampleCount = waitDaysList.length
  const waitTimeHistogram: WaitTimeHistogramData = {
    buckets: WAIT_TIME_BUCKETS.map((b, i) => ({
      label: b.label,
      shortLabel: b.shortLabel,
      count: bucketCounts[i],
      percentage: sampleCount > 0 ? (bucketCounts[i] / sampleCount) * 100 : 0,
    })),
    sampleCount,
    median: quantile(waitDaysList, 0.5),
    p90: quantile(waitDaysList, 0.9),
    p95: quantile(waitDaysList, 0.95),
    mean: sampleCount > 0 ? Math.round(waitSum / sampleCount) : null,
    max: sampleCount > 0 ? waitDaysList[sampleCount - 1] : null,
  }

  const computeTimeMs = Math.max(1, Math.round(performance.now() - t0))

  return {
    kpis,
    statusByUnit,
    timeSeries,
    heatmap,
    waitTimeHistogram,
    computeTimeMs,
  }
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data
  try {
    if (msg.type === 'LOAD_DATA') {
      cachedRecords = msg.records
      const options = extractFilterOptions(cachedRecords)
      const out: WorkerOutMessage = {
        type: 'DATA_LOADED',
        count: cachedRecords.length,
        options,
      }
      self.postMessage(out)
    } else if (msg.type === 'AGGREGATE') {
      const data = aggregate(msg.filters)
      const out: WorkerOutMessage = {
        type: 'AGGREGATED',
        data,
      }
      self.postMessage(out)
    }
  } catch (err) {
    const out: WorkerOutMessage = {
      type: 'ERROR',
      message: err instanceof Error ? err.message : 'Erro no processamento em segundo plano.',
    }
    self.postMessage(out)
  }
}
