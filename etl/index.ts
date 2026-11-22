/**
 * ETL GERCON: CSV oficial (Dados Abertos POA / CKAN) -> PostgreSQL (Supabase)
 *
 * Uso:
 *   npm run etl                                    # todos os anos
 *   ETL_YEARS=2025,2024 npm run etl                # anos específicos
 *   ETL_DRY_RUN=1 ETL_MAX_ROWS=20000 npm run etl   # testa sem banco
 *
 * Variáveis de ambiente:
 *   DATABASE_URL    conexão Postgres; obrigatória fora do dry run
 *   ETL_YEARS       lista separada por vírgula (padrão: todos os anos)
 *   ETL_BATCH_SIZE  linhas por INSERT (padrão: 5000)
 *   ETL_DRY_RUN     "1" lê e normaliza, mas não grava nada
 *   ETL_FORCE       "1" reprocessa mesmo se o CSV não mudou desde a última carga
 *   ETL_MAX_ROWS    para a leitura após N linhas (útil para testes)
 *
 * O esquema esperado está em etl/schema.sql.
 */
import { Readable, pipeline } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import { parse } from 'csv-parse'
import pg from 'pg'
import { AVAILABLE_YEARS, GERCON_RESOURCES_BY_YEAR } from '../src/services/ckanService'
import { normalizeGerconStatus } from '../src/constants/palette'
import type { GerconYear } from '../src/types/gercon'

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
 * Colunas gravadas em gercon.solicitacoes e seus tipos no Postgres.
 * É o único ponto a ajustar quando o esquema definitivo mudar.
 */
const COLUMNS = {
  ano: 'smallint',
  id_solicitacao: 'bigint',
  data_extracao: 'date',
  data_solicitacao: 'date',
  data_consulta: 'date',
  status_bruto: 'text',
  status: 'gercon.status_normalizado',
  classificacao_risco: 'text',
  complexidade: 'text',
  especialidade: 'text',
  especialidade_mae: 'text',
  cid: 'text',
  idade: 'smallint',
  municipio_residencia: 'text',
  cnes_solicitante: 'integer',
  unidade_solicitante: 'text',
  cnes_executante: 'integer',
  unidade_executante: 'text',
  municipio_executante: 'text',
  tipo_consulta: 'text',
  dias_fila_fonte: 'integer',
  dias_espera: 'integer',
} as const

type Row = Record<keyof typeof COLUMNS, string | number | null>
type CsvRecord = Record<string, string | undefined>

/** Converte uma linha do CSV em Row, ou retorna null se a linha for inválida. */
function normalizeRow(csv: CsvRecord, ano: GerconYear): Row | null {
  const idSolicitacao = toInt(csv.idsolicitacao)
  const dataSolicitacao = toDate(csv.data_solicitacao)
  if (idSolicitacao === null || dataSolicitacao === null) return null

  const dataConsulta = toDate(csv.datahora_consulta)
  const diasFila = toInt(csv.diasfilaespera)
  const statusBruto = text(csv.situacaosolicitacao)?.toUpperCase() ?? 'DESCONHECIDO'
  const risco = text(csv.corregulador)?.toUpperCase() ?? null

  return {
    ano,
    id_solicitacao: idSolicitacao,
    data_extracao: toDate(csv.data_extracao),
    data_solicitacao: dataSolicitacao,
    data_consulta: dataConsulta,
    status_bruto: statusBruto,
    status: normalizeGerconStatus(statusBruto),
    classificacao_risco: risco === 'NENHUM' || risco === 'NULL' ? null : risco,
    complexidade: text(csv.complexidade),
    especialidade: text(csv.especialidade),
    especialidade_mae: text(csv.especialidademae) ?? text(csv.especialidade),
    cid: text(csv.cid),
    idade: toInt(csv.idade),
    municipio_residencia: text(csv.municipio_residencia),
    cnes_solicitante: toInt(csv.cnes_solicitante),
    unidade_solicitante: text(csv.unidadesolicitante),
    cnes_executante: toInt(csv.cnesexecutante),
    unidade_executante: text(csv.unidadeexecutante),
    municipio_executante: text(csv.municipio_executante),
    tipo_consulta: text(csv.tipoconsulta),
    dias_fila_fonte: diasFila,
    dias_espera: computeWaitDays(dataSolicitacao, dataConsulta, diasFila),
  }
}

/** Dias entre solicitação e consulta; sem consulta, usa diasfilaespera. Descarta valores fora de 0..3650. */
function computeWaitDays(solicitacao: string, consulta: string | null, diasFila: number | null) {
  if (consulta) {
    const diff = (Date.parse(consulta) - Date.parse(solicitacao)) / 86_400_000
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
const runIdParam = columnNames.length + 1

/**
 * Upsert em lote com um único comando: cada coluna vira um array e o unnest() remonta as linhas.
 * Bem mais rápido que um INSERT por linha e sem precisar de tabela de staging.
 */
const UPSERT_SQL = `
  insert into gercon.solicitacoes (${columnNames.join(', ')}, etl_run_id)
  select *, $${runIdParam}::bigint
  from unnest(${columnNames.map((c, i) => `$${i + 1}::${COLUMNS[c]}[]`).join(', ')})
  on conflict (ano, id_solicitacao) do update set
    ${[...columnNames.slice(2), 'etl_run_id'].map((c) => `${c} = excluded.${c}`).join(',\n    ')}
`

async function upsertBatch(db: pg.Pool, rows: Row[], runId: number): Promise<number> {
  // O Postgres rejeita a mesma chave duas vezes no mesmo comando; a última ocorrência vence.
  const unique = [...new Map(rows.map((r) => [r.id_solicitacao, r])).values()]
  const params = columnNames.map((c) => unique.map((r) => r[c]))
  const result = await db.query(UPSERT_SQL, [...params, runId])
  return result.rowCount ?? 0
}

async function wasAlreadyLoaded(db: pg.Pool, ano: number, lastModified: string | null) {
  const { rowCount } = await db.query(
    `select 1 from gercon.etl_runs
     where ano = $1 and status = 'success' and resource_last_modified = $2 limit 1`,
    [ano, lastModified]
  )
  return (rowCount ?? 0) > 0
}

async function startRun(db: pg.Pool, ano: number, resourceId: string, lastModified: string | null) {
  const { rows } = await db.query<{ id: number }>(
    `insert into gercon.etl_runs (ano, resource_id, resource_last_modified)
     values ($1, $2, $3) returning id`,
    [ano, resourceId, lastModified]
  )
  return rows[0].id
}

async function finishRun(db: pg.Pool, runId: number, stats: Stats, error?: unknown) {
  await db.query(
    `update gercon.etl_runs set
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

/** Remove do ano as solicitações que sumiram da fonte, ou seja, as que não foram tocadas nesta execução. */
async function deleteStaleRows(db: pg.Pool, ano: number, runId: number) {
  const { rowCount } = await db.query(
    'delete from gercon.solicitacoes where ano = $1 and etl_run_id <> $2',
    [ano, runId]
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

  // Leituras parciais (ETL_MAX_ROWS) não guardam last_modified, para não fazer a próxima carga completa ser pulada.
  const isFullRead = config.maxRows === Infinity
  const runId = db ? await startRun(db, ano, resourceId, isFullRead ? lastModified : null) : 0
  const stats: Stats = { lidas: 0, gravadas: 0, rejeitadas: 0, removidas: 0 }
  const abort = new AbortController()
  const startedAt = Date.now()

  const write = async (rows: Row[]) => {
    if (db && rows.length > 0) stats.gravadas += await upsertBatch(db, rows, runId)
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

      const row = normalizeRow(record, ano)
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

    // Só limpa linhas antigas se o arquivo foi lido por completo.
    if (db && isFullRead) stats.removidas = await deleteStaleRows(db, ano, runId)
    if (db) await finishRun(db, runId, stats)

    const secs = ((Date.now() - startedAt) / 1000).toFixed(1)
    log(
      ano,
      `ok em ${secs}s: ${fmt(stats.lidas)} lidas, ${fmt(stats.gravadas)} gravadas, ` +
        `${fmt(stats.rejeitadas)} rejeitadas, ${fmt(stats.removidas)} removidas`
    )
  } catch (err) {
    if (db) await finishRun(db, runId, stats, err)
    throw err
  } finally {
    abort.abort() // encerra o download se a leitura parou antes do fim (ETL_MAX_ROWS ou erro)
  }
}

async function main() {
  if (!config.dryRun && !config.databaseUrl) {
    throw new Error('Defina DATABASE_URL, ou use ETL_DRY_RUN=1 para rodar sem banco.')
  }

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
