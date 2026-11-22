import { normalizeGerconStatus, normalizeRiskLabel } from '@/constants/palette'
import type {
  CkanSqlResponse,
  DataScope,
  DownloadProgress,
  GerconRecord,
  GerconYear,
  RawGerconRecord,
} from '@/types/gercon'

export const AVAILABLE_YEARS: GerconYear[] = [
  2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017,
]

export const DEFAULT_YEAR: GerconYear = 2025

/**
 * Mapeamento oficial dos recursos CKAN (Dados Abertos de Porto Alegre - GERCON)
 */
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

const CKAN_BASE_PATH = '/ckan-api/api/3/action/datastore_search_sql'
const BATCH_SIZE = 5000
const REQUEST_TIMEOUT_MS = 28000
const MAX_RETRIES = 2

function extractDateOnly(ts: string | null | undefined): string | null {
  if (!ts) return null
  const trimmed = ts.trim()
  if (trimmed.length >= 10) {
    const datePart = trimmed.slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return datePart
    }
  }
  return null
}

function computeWaitDays(
  solicitacao: string | null,
  consulta: string | null,
  diasFila: number | string | null
): number | null {
  if (solicitacao && consulta) {
    const t1 = Date.parse(`${solicitacao}T00:00:00Z`)
    const t2 = Date.parse(`${consulta}T00:00:00Z`)
    if (!Number.isNaN(t1) && !Number.isNaN(t2)) {
      const diff = Math.round((t2 - t1) / 86_400_000)
      if (diff >= 0 && diff <= 3650) {
        return diff
      }
    }
  }
  if (diasFila !== null && diasFila !== undefined && diasFila !== '') {
    const parsed = Number(diasFila)
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 3650) {
      return Math.round(parsed)
    }
  }
  return null
}

function normalizeRecord(raw: RawGerconRecord): GerconRecord | null {
  const dataSolicitacao = extractDateOnly(raw.data_solicitacao)
  if (!dataSolicitacao) return null

  const dataAgendamento = extractDateOnly(raw.datahora_consulta)
  const statusBruto = (raw.situacaosolicitacao ?? '').trim() || 'DESCONHECIDO'
  const unidadeExec = (raw.unidadeexecutante ?? '').trim()
  const unidadeSol = (raw.unidadesolicitante ?? '').trim()
  const especialidade = (raw.especialidade ?? '').trim() || 'Não informada'
  const especialidadeMae = (raw.especialidademae ?? '').trim() || especialidade
  const municipio = (raw.municipio_residencia ?? '').trim() || 'Não informado'

  return {
    _id: Number(raw._id),
    data_solicitacao: dataSolicitacao,
    data_agendamento: dataAgendamento,
    especialidade,
    especialidade_mae: especialidadeMae,
    cid: (raw.cid ?? '').trim() || '—',
    classificacao_risco: normalizeRiskLabel(raw.corregulador),
    municipio_residencia: municipio,
    unidade_solicitante: unidadeSol || 'Não informada',
    unidade_executante: unidadeExec || 'Aguardando definição de unidade',
    status_bruto: statusBruto,
    status: normalizeGerconStatus(statusBruto),
    dias_espera: computeWaitDays(dataSolicitacao, dataAgendamento, raw.diasfilaespera),
  }
}

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  const onExternalAbort = () => controller.abort()
  signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    return await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (signal?.aborted) {
        throw new Error('Sincronização cancelada pelo usuário.')
      }
      throw new Error(
        'Tempo limite excedido (timeout) ao consultar a API CKAN de Dados Abertos de Porto Alegre.'
      )
    }
    throw new Error(
      'Falha de conexão com a API de Dados Abertos de Porto Alegre. Verifique sua conexão e tente novamente.'
    )
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onExternalAbort)
  }
}

async function queryBatch(
  year: GerconYear,
  resourceId: string,
  scope: DataScope,
  limit: number,
  offset: number,
  useWildcardSelect: boolean,
  signal?: AbortSignal
): Promise<{ records: RawGerconRecord[]; usedWildcard: boolean }> {
  const whereClause =
    scope === 'poa'
      ? `WHERE municipio_residencia = 'PORTO ALEGRE' AND data_solicitacao >= '${year}-01-01' AND data_solicitacao < '${year + 1}-01-01'`
      : `WHERE data_solicitacao >= '${year}-01-01' AND data_solicitacao < '${year + 1}-01-01'`

  const selectCols = useWildcardSelect
    ? '*'
    : [
        '_id, data_extracao, data_solicitacao, datahora_consulta, diasfilaespera,',
        'especialidade, especialidademae, cid, corregulador, municipio_residencia,',
        'unidadesolicitante, unidadeexecutante, situacaosolicitacao',
      ].join(' ')

  const sql = [
    `SELECT ${selectCols}`,
    `FROM "${resourceId}"`,
    whereClause,
    'ORDER BY _id ASC',
    `LIMIT ${limit} OFFSET ${offset}`,
  ].join(' ')

  const url = `${CKAN_BASE_PATH}?sql=${encodeURIComponent(sql)}`

  let lastError: Error | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, signal)
      if (!response.ok) {
        // Anos mais antigos podem omitir alguma coluna opcional; tenta SELECT * uma vez
        if (!useWildcardSelect && (response.status === 400 || response.status === 409)) {
          return queryBatch(year, resourceId, scope, limit, offset, true, signal)
        }
        if (response.status === 429) {
          throw new Error(
            'Limite de requisições (rate limit) atingido na API CKAN. Aguarde alguns segundos e tente novamente.'
          )
        }
        if (response.status >= 500) {
          throw new Error(
            `A API CKAN retornou indisponibilidade temporária (HTTP ${response.status}).`
          )
        }
        throw new Error(`Erro HTTP ${response.status} ao consultar dados do GERCON ${year}.`)
      }

      const payload = (await response.json()) as CkanSqlResponse
      if (!payload.success || !payload.result?.records) {
        throw new Error(payload.error?.message ?? 'Resposta inválida da API CKAN.')
      }

      return { records: payload.result.records, usedWildcard: useWildcardSelect }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (signal?.aborted || attempt === MAX_RETRIES) {
        throw lastError
      }
      await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)))
    }
  }

  throw lastError ?? new Error(`Erro inesperado ao baixar dados do GERCON ${year}.`)
}

export interface FetchGerconResult {
  records: GerconRecord[]
  dataExtracao: string | null
  resourceId: string
}

/**
 * Baixa os dados reais do GERCON para o ano selecionado em lotes paginados.
 */
export async function fetchGerconYearData(options: {
  year: GerconYear
  scope: DataScope
  targetCount: number
  onProgress?: (progress: DownloadProgress) => void
  signal?: AbortSignal
}): Promise<FetchGerconResult> {
  const { year, scope, targetCount, onProgress, signal } = options
  const resourceId = GERCON_RESOURCES_BY_YEAR[year]
  const totalBatches = Math.ceil(targetCount / BATCH_SIZE)
  const records: GerconRecord[] = []
  let dataExtracao: string | null = null
  let useWildcard = false

  for (let batch = 0; batch < totalBatches; batch++) {
    const offset = batch * BATCH_SIZE
    const limit = Math.min(BATCH_SIZE, targetCount - offset)

    onProgress?.({
      fetched: records.length,
      target: targetCount,
      batch: batch + 1,
      totalBatches,
      message: `Baixando lote ${batch + 1} de ${totalBatches} da API CKAN (Dados Abertos POA ${year})...`,
    })

    const { records: rawRows, usedWildcard } = await queryBatch(
      year,
      resourceId,
      scope,
      limit,
      offset,
      useWildcard,
      signal
    )
    useWildcard = usedWildcard

    if (rawRows.length === 0) {
      break
    }

    if (!dataExtracao && rawRows[0]?.data_extracao) {
      dataExtracao = extractDateOnly(rawRows[0].data_extracao)
    }

    for (const raw of rawRows) {
      const normalized = normalizeRecord(raw)
      if (normalized) {
        records.push(normalized)
      }
    }

    onProgress?.({
      fetched: records.length,
      target: targetCount,
      batch: batch + 1,
      totalBatches,
      message: `${records.length.toLocaleString('pt-BR')} registros de ${year} processados...`,
    })

    if (rawRows.length < limit) {
      break
    }
  }

  if (records.length === 0) {
    throw new Error(`Nenhum registro de ${year} foi retornado pela API CKAN.`)
  }

  return { records, dataExtracao, resourceId }
}
