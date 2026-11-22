import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../database'
import { etlRuns } from '../schema'

export interface EtlRunCounts {
  linhasLidas: number
  linhasGravadas: number
  linhasRejeitadas: number
  linhasRemovidas: number
}

export interface StartedEtlRun {
  id: number
  /** Horário de início segundo o relógio do banco, para comparar com updated_at sem diferença de relógio. */
  startedAt: Date
}

export interface EtlRunsStore {
  /** Diz se já houve uma carga bem-sucedida deste ano com o CSV na mesma versão. */
  hasSuccessfulRunFor(anoRecurso: number, resourceLastModified: string | null): Promise<boolean>
  start(anoRecurso: number, ckanResourceId: string, resourceLastModified: string | null): Promise<StartedEtlRun>
  markSuccess(runId: number, counts: EtlRunCounts): Promise<void>
  markFailure(runId: number, counts: EtlRunCounts, error: unknown): Promise<void>
}

/** Histórico das execuções em public.etl_runs. */
export class EtlRunsRepository implements EtlRunsStore {
  constructor(private readonly db: Database) {}

  async hasSuccessfulRunFor(anoRecurso: number, resourceLastModified: string | null): Promise<boolean> {
    if (resourceLastModified === null) return false

    const successfulRuns = await this.db
      .select({ id: etlRuns.id })
      .from(etlRuns)
      .where(
        and(
          eq(etlRuns.anoRecurso, anoRecurso),
          eq(etlRuns.status, 'success'),
          eq(etlRuns.resourceLastModified, resourceLastModified)
        )
      )
      .limit(1)
    return successfulRuns.length > 0
  }

  async start(
    anoRecurso: number,
    ckanResourceId: string,
    resourceLastModified: string | null
  ): Promise<StartedEtlRun> {
    const [run] = await this.db
      .insert(etlRuns)
      .values({ anoRecurso, ckanResourceId, resourceLastModified })
      .returning({ id: etlRuns.id, startedAt: etlRuns.iniciadoEm })
    return run
  }

  async markSuccess(runId: number, counts: EtlRunCounts): Promise<void> {
    await this.finish(runId, counts, null)
  }

  async markFailure(runId: number, counts: EtlRunCounts, error: unknown): Promise<void> {
    await this.finish(runId, counts, String(error))
  }

  private async finish(runId: number, counts: EtlRunCounts, errorMessage: string | null) {
    await this.db
      .update(etlRuns)
      .set({
        ...counts,
        status: errorMessage === null ? 'success' : 'error',
        erro: errorMessage,
        finalizadoEm: sql`now()`,
      })
      .where(eq(etlRuns.id, runId))
  }
}

/** Usado no dry run: nunca pula anos e não registra nada. */
export class DryRunEtlRunsRepository implements EtlRunsStore {
  async hasSuccessfulRunFor(): Promise<boolean> {
    return false
  }

  async start(): Promise<StartedEtlRun> {
    return { id: 0, startedAt: new Date() }
  }

  async markSuccess(): Promise<void> {}

  async markFailure(): Promise<void> {}
}
