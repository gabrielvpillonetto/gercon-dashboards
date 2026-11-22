import { onUnmounted, reactive, ref, watch } from 'vue'
import { ALL_STATUSES } from '@/constants/palette'
import {
  DEFAULT_YEAR,
  fetchGerconYearData,
  GERCON_RESOURCES_BY_YEAR,
} from '@/services/ckanService'
import {
  clearYearCache,
  listCachedYears,
  loadDatasetFromBrowserStorage,
  saveDatasetToBrowserStorage,
} from '@/services/storageService'
import type {
  AggregatedDashboardData,
  CacheMetadata,
  DashboardFilters,
  DataScope,
  DownloadProgress,
  FilterOptions,
  GerconRecord,
  GerconYear,
  WorkerInMessage,
  WorkerOutMessage,
} from '@/types/gercon'

const DEFAULT_TARGET_COUNT = 25000

export function useGerconData() {
  const selectedYear = ref<GerconYear>(DEFAULT_YEAR)
  const selectedScope = ref<DataScope>('poa')
  const selectedTargetCount = ref<number>(DEFAULT_TARGET_COUNT)
  const cachedYears = ref<GerconYear[]>([])

  const status = ref<'checking' | 'downloading' | 'ready' | 'error'>('checking')
  const isComputing = ref(false)
  const errorMessage = ref<string | null>(null)
  const loadedFromCache = ref(false)
  const cacheMeta = ref<CacheMetadata | null>(null)
  const progress = ref<DownloadProgress>({
    fetched: 0,
    target: DEFAULT_TARGET_COUNT,
    batch: 0,
    totalBatches: 5,
    message: 'Verificando armazenamento local do navegador...',
  })

  const filterOptions = ref<FilterOptions>({
    especialidades: [],
    municipios: [],
    classificacoesRisco: [],
    minDate: `${DEFAULT_YEAR}-01-01`,
    maxDate: `${DEFAULT_YEAR}-12-31`,
  })

  const filters = reactive<DashboardFilters>({
    especialidade: '',
    municipio: '',
    statuses: [...ALL_STATUSES],
    classificacaoRisco: '',
    dataInicio: `${DEFAULT_YEAR}-01-01`,
    dataFim: `${DEFAULT_YEAR}-12-31`,
    granularity: 'monthly',
    heatmapDimension: 'especialidade',
    waitTimeScope: 'atendidas',
    topUnitsLimit: 10,
  })

  const aggregated = ref<AggregatedDashboardData | null>(null)

  let worker: Worker | null = null
  let activeAbortController: AbortController | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function refreshCachedYearsList() {
    try {
      cachedYears.value = await listCachedYears()
    } catch {
      cachedYears.value = []
    }
  }

  function ensureWorker(): Worker {
    if (!worker) {
      worker = new Worker(new URL('../workers/analytics.worker.ts', import.meta.url), {
        type: 'module',
      })
      worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
        const msg = event.data
        if (msg.type === 'DATA_LOADED') {
          filterOptions.value = msg.options
          filters.especialidade = ''
          filters.municipio = ''
          filters.classificacaoRisco = ''
          filters.statuses = [...ALL_STATUSES]
          filters.dataInicio = msg.options.minDate
          filters.dataFim = msg.options.maxDate
          requestAggregation()
        } else if (msg.type === 'AGGREGATED') {
          aggregated.value = msg.data
          isComputing.value = false
          status.value = 'ready'
        } else if (msg.type === 'ERROR') {
          errorMessage.value = msg.message
          isComputing.value = false
          status.value = 'error'
        }
      }
      worker.onerror = (err) => {
        errorMessage.value = `Falha no Web Worker de análise: ${err.message}`
        isComputing.value = false
        status.value = 'error'
      }
    }
    return worker
  }

  function hydrateWorker(records: GerconRecord[]) {
    isComputing.value = true
    const w = ensureWorker()
    const payload: WorkerInMessage = { type: 'LOAD_DATA', records }
    w.postMessage(payload)
  }

  function requestAggregation() {
    if (!worker) return
    isComputing.value = true
    const snapshot: DashboardFilters = {
      especialidade: filters.especialidade,
      municipio: filters.municipio,
      statuses: [...filters.statuses],
      classificacaoRisco: filters.classificacaoRisco,
      dataInicio: filters.dataInicio,
      dataFim: filters.dataFim,
      granularity: filters.granularity,
      heatmapDimension: filters.heatmapDimension,
      waitTimeScope: filters.waitTimeScope,
      topUnitsLimit: filters.topUnitsLimit,
    }
    const payload: WorkerInMessage = { type: 'AGGREGATE', filters: snapshot }
    worker.postMessage(payload)
  }

  watch(
    () => ({
      especialidade: filters.especialidade,
      municipio: filters.municipio,
      statuses: filters.statuses.join(','),
      classificacaoRisco: filters.classificacaoRisco,
      dataInicio: filters.dataInicio,
      dataFim: filters.dataFim,
      granularity: filters.granularity,
      heatmapDimension: filters.heatmapDimension,
      waitTimeScope: filters.waitTimeScope,
      topUnitsLimit: filters.topUnitsLimit,
    }),
    () => {
      if (status.value !== 'ready') return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        requestAggregation()
      }, 40)
    }
  )

  async function downloadAndCache(
    year: GerconYear = selectedYear.value,
    scope: DataScope = selectedScope.value,
    targetCount: number = selectedTargetCount.value
  ) {
    activeAbortController?.abort()
    activeAbortController = new AbortController()

    selectedYear.value = year
    selectedScope.value = scope
    selectedTargetCount.value = targetCount

    status.value = 'downloading'
    errorMessage.value = null
    loadedFromCache.value = false
    progress.value = {
      fetched: 0,
      target: targetCount,
      batch: 0,
      totalBatches: Math.ceil(targetCount / 5000),
      message: `Conectando à API CKAN de Dados Abertos de Porto Alegre (GERCON ${year})...`,
    }

    try {
      const { records, dataExtracao, resourceId } = await fetchGerconYearData({
        year,
        scope,
        targetCount,
        signal: activeAbortController.signal,
        onProgress: (p) => {
          progress.value = p
        },
      })

      progress.value = {
        ...progress.value,
        fetched: records.length,
        message: `Salvando dados de ${year} no armazenamento local do navegador (IndexedDB)...`,
      }

      const meta: CacheMetadata = {
        version: 1,
        resourceId: resourceId || GERCON_RESOURCES_BY_YEAR[year],
        year,
        scope,
        recordCount: records.length,
        downloadedAt: new Date().toISOString(),
        dataExtracao,
      }

      await saveDatasetToBrowserStorage(year, records, meta)
      cacheMeta.value = meta
      await refreshCachedYearsList()

      progress.value = {
        ...progress.value,
        message: 'Inicializando motor de agregação (Web Worker)...',
      }

      hydrateWorker(records)
    } catch (err) {
      errorMessage.value =
        err instanceof Error
          ? err.message
          : `Erro desconhecido ao baixar dados de ${year} do GERCON.`
      status.value = 'error'
    }
  }

  async function loadYear(year: GerconYear) {
    activeAbortController?.abort()
    selectedYear.value = year
    status.value = 'checking'
    errorMessage.value = null
    progress.value = {
      fetched: 0,
      target: selectedTargetCount.value,
      batch: 0,
      totalBatches: Math.ceil(selectedTargetCount.value / 5000),
      message: `Verificando cache local para o ano ${year}...`,
    }

    await refreshCachedYearsList()

    try {
      const cached = await loadDatasetFromBrowserStorage(year)
      if (cached && cached.records.length > 0) {
        loadedFromCache.value = true
        cacheMeta.value = cached.meta
        selectedScope.value = cached.meta.scope
        hydrateWorker(cached.records)
        return
      }
    } catch {
      // Se IndexedDB falhar na leitura, prossegue com download limpo
    }

    await downloadAndCache(year, selectedScope.value, selectedTargetCount.value)
  }

  async function initialize() {
    await loadYear(selectedYear.value)
  }

  async function switchYear(year: GerconYear) {
    if (year === selectedYear.value && status.value === 'ready') return
    await loadYear(year)
  }

  async function clearAndResync(scope: DataScope, targetCount = DEFAULT_TARGET_COUNT) {
    const year = selectedYear.value
    resetFilters()
    await clearYearCache(year)
    await refreshCachedYearsList()
    await downloadAndCache(year, scope, targetCount)
  }

  function resetFilters() {
    filters.especialidade = ''
    filters.municipio = ''
    filters.statuses = [...ALL_STATUSES]
    filters.classificacaoRisco = ''
    filters.dataInicio = filterOptions.value.minDate
    filters.dataFim = filterOptions.value.maxDate
  }

  onUnmounted(() => {
    activeAbortController?.abort()
    if (debounceTimer) clearTimeout(debounceTimer)
    worker?.terminate()
  })

  return {
    selectedYear,
    cachedYears,
    status,
    isComputing,
    errorMessage,
    loadedFromCache,
    cacheMeta,
    progress,
    filterOptions,
    filters,
    aggregated,
    initialize,
    switchYear,
    downloadAndCache,
    clearAndResync,
    resetFilters,
  }
}
