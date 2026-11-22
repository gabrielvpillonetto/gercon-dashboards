import { GERCON_RESOURCES_BY_YEAR, type GerconYear } from '../../packages/gercon-domain'
import type { CkanClient } from './ckanClient'
import type { EtlConfig } from './config'
import type { SolicitacaoRow } from './schema'
import type { EtlRunCounts, EtlRunsStore } from './repositories/etlRunsRepository'
import type { SolicitacoesWriter } from './repositories/solicitacoesRepository'
import { SolicitacaoMapper } from './solicitacaoMapper'
import { BatchWriter } from './utils/batchWriter'
import { formatCount, logYear } from './utils/logger'

const PROGRESS_LOG_INTERVAL = 100_000

type YearSyncOptions = Pick<EtlConfig, 'batchSize' | 'forceReload' | 'maxRowsPerYear'>

/**
 * Sincroniza um ano do GERCON: baixa o CSV do CKAN, normaliza cada linha,
 * faz upsert em lotes e remove do banco as solicitações que sumiram da fonte.
 */
export class YearSyncPipeline {
  constructor(
    private readonly ckanClient: CkanClient,
    private readonly solicitacoes: SolicitacoesWriter,
    private readonly etlRuns: EtlRunsStore,
    private readonly options: YearSyncOptions
  ) {}

  async syncYear(ano: GerconYear): Promise<void> {
    const ckanResourceId = GERCON_RESOURCES_BY_YEAR[ano]
    const { csvUrl, lastModified } = await this.ckanClient.getResourceMetadata(ckanResourceId)

    if (!this.options.forceReload && (await this.etlRuns.hasSuccessfulRunFor(ano, lastModified))) {
      logYear(ano, `sem alterações desde ${lastModified}, pulando`)
      return
    }

    const etlRun = await this.etlRuns.start(ano, ckanResourceId, lastModified)
    const counts: EtlRunCounts = { linhasLidas: 0, linhasGravadas: 0, linhasRejeitadas: 0, linhasRemovidas: 0 }
    const downloadAbort = new AbortController()
    const startedAtMs = Date.now()

    try {
      logYear(ano, `baixando ${csvUrl}`)
      const csvRecords = await this.ckanClient.openCsvRecordStream(csvUrl, downloadAbort.signal)
      const mapper = new SolicitacaoMapper(ano, ckanResourceId)
      const batchWriter = new BatchWriter<SolicitacaoRow>(this.options.batchSize, async (batch) => {
        counts.linhasGravadas += await this.solicitacoes.upsertBatch(batch)
      })

      for await (const csvRecord of csvRecords) {
        if (counts.linhasLidas >= this.options.maxRowsPerYear) break
        counts.linhasLidas++

        const row = mapper.toDatabaseRow(csvRecord)
        if (row) await batchWriter.add(row)
        else counts.linhasRejeitadas++

        if (counts.linhasLidas % PROGRESS_LOG_INTERVAL === 0) {
          logYear(ano, `${formatCount(counts.linhasLidas)} linhas lidas...`)
        }
      }
      await batchWriter.finish()

      counts.linhasRemovidas = await this.solicitacoes.deleteNotUpdatedSince(ano, etlRun.startedAt)
      await this.etlRuns.markSuccess(etlRun.id, counts)
      this.logSummary(ano, counts, startedAtMs)
    } catch (error) {
      await this.etlRuns.markFailure(etlRun.id, counts, error)
      throw error
    } finally {
      downloadAbort.abort() // encerra o download se a leitura parou antes do fim (ETL_MAX_ROWS ou erro)
    }
  }

  private logSummary(ano: number, counts: EtlRunCounts, startedAtMs: number) {
    const seconds = ((Date.now() - startedAtMs) / 1000).toFixed(1)
    logYear(
      ano,
      `ok em ${seconds}s: ${formatCount(counts.linhasLidas)} lidas, ` +
        `${formatCount(counts.linhasGravadas)} gravadas, ` +
        `${formatCount(counts.linhasRejeitadas)} rejeitadas, ` +
        `${formatCount(counts.linhasRemovidas)} removidas`
    )
  }
}
