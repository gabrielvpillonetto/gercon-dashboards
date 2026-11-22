import { normalizeGerconStatus, normalizeRiskLabel } from '@/constants/palette'
import type {
  DataScope,
  DownloadProgress,
  GerconRecord,
  GerconYear,
} from '@/types/gercon'
import { getSupabaseClient } from './supabase'

const PAGE_SIZE = 5000

interface SolicitationRow {
  ano_recurso: number
  idsolicitacao: number
  ckan_resource_id: string
  ckan_id: number | null
  data_extracao: string | null
  data_solicitacao: string
  data_agendamento: string | null
  especialidade: string
  especialidade_mae: string
  cid: string
  classificacao_risco: string
  municipio_residencia: string
  unidade_solicitante: string
  unidade_executante: string
  status_bruto: string
  status: string
  dias_espera: number | null
}

export interface FetchSupabaseResult {
  records: GerconRecord[]
  dataExtracao: string | null
  resourceId: string
}

export async function fetchSupabaseYearData(options: {
  year: GerconYear
  scope: DataScope
  targetCount: number
  onProgress?: (progress: DownloadProgress) => void
  signal?: AbortSignal
}): Promise<FetchSupabaseResult> {
  const { year, scope, targetCount, onProgress, signal } = options
  const supabase = getSupabaseClient()
  const records: GerconRecord[] = []
  let dataExtracao: string | null = null
  let resourceId = ''
  const totalBatches = Math.ceil(targetCount / PAGE_SIZE)

  for (let batch = 0; batch < totalBatches; batch++) {
    const from = batch * PAGE_SIZE
    const limit = Math.min(PAGE_SIZE, targetCount - from)

    onProgress?.({
      fetched: records.length,
      target: targetCount,
      batch: batch + 1,
      totalBatches,
      message: `Consultando Supabase, lote ${batch + 1} de ${totalBatches} (${year})...`,
    })

    let query = supabase
      .from('solicitacoes')
      .select(`
        ano_recurso,
        idsolicitacao,
        ckan_resource_id,
        ckan_id,
        data_extracao,
        data_solicitacao,
        data_agendamento,
        especialidade,
        especialidade_mae,
        cid,
        classificacao_risco,
        municipio_residencia,
        unidade_solicitante,
        unidade_executante,
        status_bruto,
        status,
        dias_espera
      `)
      .eq('ano_recurso', year)
      .order('idsolicitacao', { ascending: true })
      .range(from, from + limit - 1)

    if (signal) {
      query = query.abortSignal(signal)
    }

    if (scope === 'poa') {
      query = query.ilike('municipio_residencia', 'PORTO ALEGRE')
    }

    const { data, error } = await query
    if (error) {
      throw new Error(`Erro ao consultar dados no Supabase: ${error.message}`)
    }

    const rows = (data ?? []) as SolicitationRow[]
    if (rows.length === 0) break

    for (const row of rows) {
      if (!resourceId) resourceId = row.ckan_resource_id
      if (!dataExtracao && row.data_extracao) dataExtracao = row.data_extracao

      records.push({
        _id: row.ckan_id ?? row.idsolicitacao,
        data_solicitacao: row.data_solicitacao,
        data_agendamento: row.data_agendamento,
        especialidade: row.especialidade,
        especialidade_mae: row.especialidade_mae,
        cid: row.cid,
        classificacao_risco: normalizeRiskLabel(row.classificacao_risco),
        municipio_residencia: row.municipio_residencia,
        unidade_solicitante: row.unidade_solicitante,
        unidade_executante: row.unidade_executante,
        status_bruto: row.status_bruto,
        status: normalizeGerconStatus(row.status_bruto || row.status),
        dias_espera: row.dias_espera,
      })

      if (records.length >= targetCount) break
    }

    onProgress?.({
      fetched: records.length,
      target: targetCount,
      batch: batch + 1,
      totalBatches,
      message: `${records.length.toLocaleString('pt-BR')} registros de ${year} processados pelo Supabase...`,
    })

    if (rows.length < limit) break
  }

  if (records.length === 0) {
    throw new Error(`Nenhum registro de ${year} foi encontrado no Supabase.`)
  }

  return { records, dataExtracao, resourceId }
}
