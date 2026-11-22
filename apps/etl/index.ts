/**
 * ETL GERCON: CSV oficial (Dados Abertos POA / CKAN) -> PostgreSQL (Supabase)
 *
 * Uso:
 *   npm run etl                                    # todos os anos
 *   ETL_YEARS=2025,2024 npm run etl                # anos específicos
 *   ETL_DRY_RUN=1 ETL_MAX_ROWS=20000 npm run etl   # testa sem banco
 *
 * Variáveis de ambiente:
 *   DATABASE_URL    connection string do Postgres do Supabase (usuário postgres, que ignora RLS);
 *                   obrigatória fora do dry run
 *   ETL_YEARS       lista separada por vírgula (padrão: todos os anos)
 *   ETL_BATCH_SIZE  linhas por INSERT (padrão: 5000)
 *   ETL_DRY_RUN     "1" lê e normaliza, mas não grava nada
 *   ETL_FORCE       "1" reprocessa mesmo se o CSV não mudou desde a última carga
 *   ETL_MAX_ROWS    para a leitura após N linhas; só no dry run, porque o contrato proíbe amostras no banco
 *
 * Tabelas: supabase/migrations/ (solicitacoes, etl_runs). Contrato: docs/contrato-banco-etl.md.
 */
import { Readable, pipeline } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import { parse } from 'csv-parse'
import pg from 'pg'
import {
  AVAILABLE_YEARS,
  GERCON_RESOURCES_BY_YEAR,
  normalizeGerconStatus,
  normalizeRiskLabel,
  type GerconYear,
} from '../../packages/gercon-domain'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const env = process.env
const config = {
  databaseUrl: env.DATABASE_URL,
  years: env.ETL_YEARS
    ? (env.ETL_YEARS.split(',').map((y) => Number(y.trim())) as GerconYear[])
    : AVAILABLE_YEARS,
  batchSize: Number(env.ETL_BATCH_SIZE ?? 5000),
  dryRun: env.ETL_DRY_RUN === '1',
  force: env.ETL_FORCE === '1',
  maxRows: env.ETL_MAX_ROWS ? Number(env.ETL_MAX_ROWS) : Infinity,
}

const invalidYears = config.years.filter((y) => !AVAILABLE_YEARS.includes(y))
if (invalidYears.length > 0) throw new Error(`Anos inválidos em ETL_YEARS: ${invalidYears.join(', ')}`)
if (config.maxRows !== Infinity && !config.dryRun) throw new Error('ETL_MAX_ROWS só pode ser usado com ETL_DRY_RUN=1.')
if (!config.dryRun && !config.databaseUrl) throw new Error('Defina DATABASE_URL, ou use ETL_DRY_RUN=1 para rodar sem banco.')

const CKAN_API = 'https://dadosabertos.poa.br/api/3/action'

// ---------------------------------------------------------------------------
// Extract
// ---------------------------------------------------------------------------

interface ResourceInfo {
  csvUrl: string
  lastModified: string | null
}

async function getResourceInfo(resourceId: string): Promise<ResourceInfo> {
  const res = await fetchWithRetry(`${CKAN_API}/resource_show?id=${resourceId}`)
  const body = (await res.json()) as { result: { url: string; last_modified: string | null } }
  return { csvUrl: body.result.url, lastModified: body.result.last_modified }
}

/** Abre o CSV como stream de objetos ({ coluna: valor }) sem baixar o arquivo inteiro. */
async function openCsvStream(csvUrl: string, signal: AbortSignal) {
  const res = await fetchWithRetry(csvUrl, signal)
  const parser = parse({ columns: true, delimiter: ';', bom: true, relax_quotes: true, trim: true })
  // pipeline() repassa erros do download para o parser, e eles aparecem no for-await de syncYear.
  // O callback vazio só silencia o erro esperado quando abortamos a leitura de propósito.
  pipeline(Readable.fromWeb(res.body as ReadableStream), parser, () => {})
  return parser
}

async function fetchWithRetry(url: string, signal?: AbortSignal, attempts = 3): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`)
      return res
    } catch (err) {
      if (i >= attempts || signal?.aborted) throw err
      await new Promise((r) => setTimeout(r, 2000 * i))
    }
  }
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

/**
 * Colunas que o ETL grava em public.solicitacoes, com seus tipos no Postgres.
 * created_at e updated_at ficam de fora: o banco e o upsert cuidam deles.
 */
const COLUMNS = {
  ano_recurso: 'smallint',
  idsolicitacao: 'bigint',
  ckan_resource_id: 'uuid',
  ckan_id: 'bigint',
  data_extracao: 'date',
  data_solicitacao: 'date',
  data_agendamento: 'date',
  especialidade: 'text',
  especialidade_mae: 'text',
  cid: 'text',
  classificacao_risco: 'text',
  municipio_residencia: 'text',
  unidade_solicitante: 'text',
  unidade_executante: 'text',
  status_bruto: 'text',
  status: 'text',
  dias_espera: 'smallint',
} as const

type Row = Record<keyof typeof COLUMNS, string | number | null>
type CsvRecord = Record<string, string | undefined>

/** Converte uma linha do CSV em Row seguindo docs/contrato-banco-etl.md, ou retorna null se for inválida. */
function normalizeRow(csv: CsvRecord, ano: GerconYear, resourceId: string): Row | null {
  const idSolicitacao = toInt(csv.idsolicitacao)
  const dataSolicitacao = toDate(csv.data_solicitacao)
  if (idSolicitacao === null || idSolicitacao <= 0 || dataSolicitacao === null) return null

  const dataAgendamento = toDate(csv.datahora_consulta)
  const statusBruto = text(csv.situacaosolicitacao)?.toUpperCase() ?? 'DESCONHECIDO'
  const especialidade = text(csv.especialidade) ?? 'Não informada'

  return {
    ano_recurso: ano,
    idsolicitacao: idSolicitacao,
    ckan_resource_id: resourceId,
    ckan_id: null, // o CSV de upload não traz o _id do datastore CKAN
    data_extracao: toDate(csv.data_extracao),
    data_solicitacao: dataSolicitacao,
    data_agendamento: dataAgendamento,
    especialidade,
    especialidade_mae: text(csv.especialidademae) ?? especialidade,
    cid: text(csv.cid) ?? '—',
    classificacao_risco: normalizeRiskLabel(csv.corregulador),
    municipio_residencia: text(csv.municipio_residencia) ?? 'Não informado',
    unidade_solicitante: text(csv.unidadesolicitante) ?? 'Não informada',
    unidade_executante: text(csv.unidadeexecutante) ?? 'Aguardando definição de unidade',
    status_bruto: statusBruto,
    status: normalizeGerconStatus(statusBruto),
    dias_espera: computeWaitDays(dataSolicitacao, dataAgendamento, toInt(csv.diasfilaespera)),
  }
}

/** Dias entre solicitação e agendamento; sem agendamento, usa diasfilaespera. Descarta valores fora de 0..3650. */
function computeWaitDays(solicitacao: string, agendamento: string | null, diasFila: number | null) {
  if (agendamento) {
    const diff = (Date.parse(agendamento) - Date.parse(solicitacao)) / 86_400_000
    if (diff >= 0 && diff <= 3650) return Math.round(diff)
  }
  if (diasFila !== null && diasFila >= 0 && diasFila <= 3650) return diasFila
  return null
}

/** String vazia -> null. */
function text(value: string | undefined): string | null {
  const v = value?.trim()
  return v ? v : null
}

function toInt(value: string | undefined): number | null {
  const v = text(value)
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

/** Aceita "2025/02/07 00:00:00.000" e "2025-02-07 00:00:00" e devolve "2025-02-07". */
function toDate(value: string | undefined): string | null {
  const v = text(value)?.slice(0, 10).replaceAll('/', '-')
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

const columnNames = Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]

/**
 * Upsert em lote com um único comando: cada coluna vira um array e o unnest() remonta as linhas.
 * Bem mais rápido que um INSERT por linha e sem precisar de tabela de staging.
 * updated_at = now() marca as linhas tocadas nesta carga; deleteStaleRows depende disso.
 */
const UPSERT_SQL = `
  insert into public.solicitacoes (${columnNames.join(', ')})
  select * from unnest(${columnNames.map((c, i) => `$${i + 1}::${COLUMNS[c]}[]`).join(', ')})
  on conflict (ano_recurso, idsolicitacao) do update set
    ${columnNames.slice(2).map((c) => `${c} = excluded.${c}`).join(',\n    ')},
    updated_at = now()
`

async function upsertBatch(db: pg.Pool, rows: Row[]): Promise<number> {
  // O Postgres rejeita a mesma chave duas vezes no mesmo comando; a última ocorrência vence.
  const unique = [...new Map(rows.map((r) => [r.idsolicitacao, r])).values()]
  const params = columnNames.map((c) => unique.map((r) => r[c]))
  const result = await db.query(UPSERT_SQL, params)
  return result.rowCount ?? 0
}

async function wasAlreadyLoaded(db: pg.Pool, ano: number, lastModified: string | null) {
  const { rowCount } = await db.query(
    `select 1 from public.etl_runs
     where ano_recurso = $1 and status = 'success' and resource_last_modified = $2 limit 1`,
    [ano, lastModified]
  )
  return (rowCount ?? 0) > 0
}

/** Registra o início da carga e devolve o id e o horário de início segundo o relógio do banco. */
async function startRun(db: pg.Pool, ano: number, resourceId: string, lastModified: string | null) {
  const { rows } = await db.query<{ id: number; iniciado_em: Date }>(
    `insert into public.etl_runs (ano_recurso, ckan_resource_id, resource_last_modified)
     values ($1, $2, $3) returning id, iniciado_em`,
    [ano, resourceId, lastModified]
  )
  return rows[0]
}

async function finishRun(db: pg.Pool, runId: number, stats: Stats, error?: unknown) {
  await db.query(
    `update public.etl_runs set
       status = $2, linhas_lidas = $3, linhas_gravadas = $4,
       linhas_rejeitadas = $5, linhas_removidas = $6, erro = $7, finalizado_em = now()
     where id = $1`,
    [
      runId,
      error ? 'error' : 'success',
      stats.lidas,
      stats.gravadas,
      stats.rejeitadas,
      stats.removidas,
      error ? String(error) : null,
    ]
  )
}

/** Remove do ano as solicitações que sumiram da fonte, ou seja, as que não foram tocadas desde o início da carga. */
async function deleteStaleRows(db: pg.Pool, ano: number, startedAt: Date) {
  const { rowCount } = await db.query(
    'delete from public.solicitacoes where ano_recurso = $1 and updated_at < $2',
    [ano, startedAt]
  )
  return rowCount ?? 0
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

interface Stats {
  lidas: number
  gravadas: number
  rejeitadas: number
  removidas: number
}

async function syncYear(db: pg.Pool | null, ano: GerconYear) {
  const resourceId = GERCON_RESOURCES_BY_YEAR[ano]
  const { csvUrl, lastModified } = await getResourceInfo(resourceId)

  if (db && !config.force && (await wasAlreadyLoaded(db, ano, lastModified))) {
    log(ano, `sem alterações desde ${lastModified}, pulando`)
    return
  }

  const run = db ? await startRun(db, ano, resourceId, lastModified) : null
  const stats: Stats = { lidas: 0, gravadas: 0, rejeitadas: 0, removidas: 0 }
  const abort = new AbortController()
  const startedAt = Date.now()

  const write = async (rows: Row[]) => {
    if (db && rows.length > 0) stats.gravadas += await upsertBatch(db, rows)
  }

  try {
    log(ano, `baixando ${csvUrl}`)
    const csv = await openCsvStream(csvUrl, abort.signal)

    // Enquanto um lote é gravado no banco, o próximo continua sendo lido e normalizado.
    // Só um INSERT fica em andamento por vez, e o stream espera no await quando o banco é o gargalo.
    let batch: Row[] = []
    let pendingWrite: Promise<void> = Promise.resolve()

    for await (const record of csv as AsyncIterable<CsvRecord>) {
      if (stats.lidas >= config.maxRows) break
      stats.lidas++

      const row = normalizeRow(record, ano, resourceId)
      if (!row) {
        stats.rejeitadas++
        continue
      }

      batch.push(row)
      if (batch.length >= config.batchSize) {
        await pendingWrite
        pendingWrite = write(batch)
        pendingWrite.catch(() => {}) // evita "unhandled rejection"; o erro aparece no próximo await
        batch = []
      }

      if (stats.lidas % 100_000 === 0) log(ano, `${fmt(stats.lidas)} linhas lidas...`)
    }

    await pendingWrite
    await write(batch)

    if (db && run) {
      stats.removidas = await deleteStaleRows(db, ano, run.iniciado_em)
      await finishRun(db, run.id, stats)
    }

    const secs = ((Date.now() - startedAt) / 1000).toFixed(1)
    log(
      ano,
      `ok em ${secs}s: ${fmt(stats.lidas)} lidas, ${fmt(stats.gravadas)} gravadas, ` +
        `${fmt(stats.rejeitadas)} rejeitadas, ${fmt(stats.removidas)} removidas`
    )
  } catch (err) {
    if (db && run) await finishRun(db, run.id, stats, err)
    throw err
  } finally {
    abort.abort() // encerra o download se a leitura parou antes do fim (ETL_MAX_ROWS ou erro)
  }
}

async function main() {
  const db = config.dryRun ? null : new pg.Pool({ connectionString: config.databaseUrl, max: 2 })
  console.log(`ETL GERCON: anos ${config.years.join(', ')}${config.dryRun ? ' (dry run)' : ''}`)

  // Os anos rodam em sequência para não sobrecarregar o servidor da prefeitura.
  // Uma falha não interrompe os anos seguintes.
  const failed: number[] = []
  for (const ano of config.years) {
    try {
      await syncYear(db, ano)
    } catch (err) {
      failed.push(ano)
      log(ano, `ERRO: ${err instanceof Error ? err.message : err}`)
    }
  }

  await db?.end()
  if (failed.length > 0) {
    console.error(`Falharam: ${failed.join(', ')}`)
    process.exitCode = 1
  }
}

function log(ano: number, msg: string) {
  console.log(`[${new Date().toISOString()}] [${ano}] ${msg}`)
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
