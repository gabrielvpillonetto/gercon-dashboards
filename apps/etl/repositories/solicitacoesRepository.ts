import { and, eq, lt, sql } from 'drizzle-orm'
import type { Database } from '../database'
import { solicitacoes, type SolicitacaoRow } from '../schema'

export interface SolicitacoesWriter {
  /** Insere ou atualiza as linhas e devolve quantas foram gravadas. */
  upsertBatch(rows: SolicitacaoRow[]): Promise<number>
  /** Remove as solicitações do ano que não foram atualizadas desde `since` e devolve quantas removeu. */
  deleteNotUpdatedSince(anoRecurso: number, since: Date): Promise<number>
}

/** O Postgres aceita no máximo 65.535 parâmetros por comando, e cada linha usa um por coluna. */
const POSTGRES_MAX_PARAMETERS = 65_535
const COLUMNS_PER_ROW = 17
const MAX_ROWS_PER_INSERT = Math.floor(POSTGRES_MAX_PARAMETERS / COLUMNS_PER_ROW)

/** Colunas sobrescritas quando a solicitação já existe; a chave e created_at ficam como estão. */
const COLUMNS_UPDATED_ON_CONFLICT = [
  'ckanResourceId',
  'ckanId',
  'dataExtracao',
  'dataSolicitacao',
  'dataAgendamento',
  'especialidade',
  'especialidadeMae',
  'cid',
  'classificacaoRisco',
  'municipioResidencia',
  'unidadeSolicitante',
  'unidadeExecutante',
  'statusBruto',
  'status',
  'diasEspera',
] as const satisfies (keyof SolicitacaoRow)[]

export class SolicitacoesRepository implements SolicitacoesWriter {
  constructor(private readonly db: Database) {}

  async upsertBatch(rows: SolicitacaoRow[]): Promise<number> {
    // O Postgres rejeita a mesma chave duas vezes no mesmo comando; a última ocorrência vence.
    const uniqueRows = [...new Map(rows.map((row) => [row.idsolicitacao, row])).values()]

    let writtenCount = 0
    for (let start = 0; start < uniqueRows.length; start += MAX_ROWS_PER_INSERT) {
      writtenCount += await this.upsertChunk(uniqueRows.slice(start, start + MAX_ROWS_PER_INSERT))
    }
    return writtenCount
  }

  async deleteNotUpdatedSince(anoRecurso: number, since: Date): Promise<number> {
    const result = await this.db
      .delete(solicitacoes)
      .where(and(eq(solicitacoes.anoRecurso, anoRecurso), lt(solicitacoes.updatedAt, since)))
    return result.rowCount ?? 0
  }

  /** updated_at = now() marca as linhas tocadas nesta carga; deleteNotUpdatedSince depende disso. */
  private async upsertChunk(rows: SolicitacaoRow[]): Promise<number> {
    const result = await this.db
      .insert(solicitacoes)
      .values(rows)
      .onConflictDoUpdate({
        target: [solicitacoes.anoRecurso, solicitacoes.idsolicitacao],
        set: { ...incomingValuesFor(COLUMNS_UPDATED_ON_CONFLICT), updatedAt: sql`now()` },
      })
    return result.rowCount ?? 0
  }
}

/** Monta { coluna: excluded.coluna }: no conflito, a linha existente recebe os valores que vieram do CSV. */
function incomingValuesFor<Key extends keyof SolicitacaoRow>(keys: readonly Key[]) {
  return Object.fromEntries(
    keys.map((key) => [key, sql.raw(`excluded.${solicitacoes[key].name}`)])
  ) as Record<Key, ReturnType<typeof sql.raw>>
}

/** Usado no dry run: aceita as linhas sem gravar nada. */
export class DryRunSolicitacoesRepository implements SolicitacoesWriter {
  async upsertBatch(): Promise<number> {
    return 0
  }

  async deleteNotUpdatedSince(): Promise<number> {
    return 0
  }
}
