import type {
  AggregatedDashboardData,
  DashboardFilters,
  DataScope,
  FilterOptions,
  GerconYear,
} from '@/types/gercon'
import { getSupabaseClient } from './supabase'

/**
 * Acesso às funções RPC do dashboard (supabase/migrations/*_create_dashboard_functions.sql).
 * Toda a agregação acontece no PostgreSQL sobre 100% das linhas do ano; o front só desenha o resultado.
 */

export interface DashboardFilterOptions extends FilterOptions {
  /** Data da extração oficial dos dados (YYYY-MM-DD), quando disponível. */
  dataExtracao: string | null
}

export async function fetchFilterOptions(
  year: GerconYear,
  scope: DataScope,
  signal?: AbortSignal
): Promise<DashboardFilterOptions> {
  let request = getSupabaseClient().rpc('dashboard_filter_options', { p_ano: year, p_escopo: scope })
  if (signal) request = request.abortSignal(signal)

  const { data, error } = await request
  if (error) throw new Error(`Erro ao carregar as opções de filtro de ${year}: ${error.message}`)
  return data as DashboardFilterOptions
}

export async function fetchDashboardData(
  year: GerconYear,
  scope: DataScope,
  filters: DashboardFilters,
  signal?: AbortSignal
): Promise<AggregatedDashboardData> {
  const startedAt = performance.now()

  let request = getSupabaseClient().rpc('dashboard_data', {
    p_ano: year,
    p_escopo: scope,
    p_filtros: filters,
  })
  if (signal) request = request.abortSignal(signal)

  const { data, error } = await request
  if (error) throw new Error(`Erro ao consultar os indicadores de ${year}: ${error.message}`)

  return {
    ...(data as Omit<AggregatedDashboardData, 'computeTimeMs'>),
    computeTimeMs: Math.max(1, Math.round(performance.now() - startedAt)),
  }
}
