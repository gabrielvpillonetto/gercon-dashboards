import { onUnmounted, reactive, ref, watch } from 'vue'
import { AVAILABLE_YEARS } from '../../../../packages/gercon-domain'
import { ALL_STATUSES } from '@/constants/palette'
import { fetchDashboardData, fetchFilterOptions } from '@/services/dashboardService'
import { isSupabaseConfigured } from '@/services/supabase'
import type {
  AggregatedDashboardData,
  DashboardFilters,
  DataScope,
  FilterOptions,
  GerconYear,
} from '@/types/gercon'

const DEFAULT_YEAR: GerconYear = 2025
const FILTER_DEBOUNCE_MS = 250

/**
 * Estado do dashboard. Os dados vêm já agregados do Supabase (RPCs dashboard_*),
 * sobre todas as solicitações do ano; aqui só guardamos filtros e o último resultado.
 */
export function useGerconData() {
  const selectedYear = ref<GerconYear>(DEFAULT_YEAR)
  const selectedScope = ref<DataScope>('poa')

  /** loading: trocando ano/escopo (mostra o loader). ready: dashboard visível. */
  const status = ref<'loading' | 'ready' | 'error'>('loading')
  /** Recalculando após mudança de filtro, com o dashboard ainda visível. */
  const isComputing = ref(false)
  const errorMessage = ref<string | null>(null)
  const dataExtracao = ref<string | null>(null)

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

  let yearRequest: AbortController | null = null
  let aggregationRequest: AbortController | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  /** Busca os indicadores com os filtros atuais, cancelando a busca anterior ainda em andamento. */
  async function refreshDashboard() {
    aggregationRequest?.abort()
    const request = new AbortController()
    aggregationRequest = request
    isComputing.value = true

    try {
      aggregated.value = await fetchDashboardData(
        selectedYear.value,
        selectedScope.value,
        { ...filters, statuses: [...filters.statuses] },
        request.signal
      )
      status.value = 'ready'
    } catch (err) {
      if (request.signal.aborted) return
      errorMessage.value = err instanceof Error ? err.message : 'Erro ao consultar o Supabase.'
      status.value = 'error'
    } finally {
      if (aggregationRequest === request) isComputing.value = false
    }
  }

  // Mudanças de filtro (já com o dashboard na tela) recalculam no banco, com debounce.
  watch(
    () => ({ ...filters, statuses: filters.statuses.join(',') }),
    () => {
      if (status.value !== 'ready') return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(refreshDashboard, FILTER_DEBOUNCE_MS)
    }
  )

  /** Carrega um ano/escopo: opções de filtro, filtros zerados e o primeiro cálculo. */
  async function loadYear(year: GerconYear, scope: DataScope = selectedScope.value) {
    yearRequest?.abort()
    aggregationRequest?.abort()
    if (debounceTimer) clearTimeout(debounceTimer)
    const request = new AbortController()
    yearRequest = request

    selectedYear.value = year
    selectedScope.value = scope
    status.value = 'loading'
    errorMessage.value = null

    if (!isSupabaseConfigured()) {
      errorMessage.value =
        'Supabase não configurado. Copie .env.example para .env na raiz do repositório e preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'
      status.value = 'error'
      return
    }

    try {
      const options = await fetchFilterOptions(year, scope, request.signal)
      dataExtracao.value = options.dataExtracao
      filterOptions.value = options
      resetFilters()
    } catch (err) {
      if (request.signal.aborted) return
      errorMessage.value = err instanceof Error ? err.message : 'Erro ao consultar o Supabase.'
      status.value = 'error'
      return
    }

    await refreshDashboard()
  }

  function initialize() {
    return loadYear(selectedYear.value)
  }

  function switchYear(year: GerconYear) {
    if (!AVAILABLE_YEARS.includes(year)) return
    return loadYear(year)
  }

  function switchScope(scope: DataScope) {
    return loadYear(selectedYear.value, scope)
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
    yearRequest?.abort()
    aggregationRequest?.abort()
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  return {
    selectedYear,
    selectedScope,
    status,
    isComputing,
    errorMessage,
    dataExtracao,
    filterOptions,
    filters,
    aggregated,
    initialize,
    switchYear,
    switchScope,
    resetFilters,
  }
}
