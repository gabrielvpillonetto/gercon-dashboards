/**
 * ETL GERCON: CSV oficial (Dados Abertos POA / CKAN) -> PostgreSQL (Supabase)
 *
 * Uso:
 *   npm run etl                                    # todos os anos
 *   ETL_YEARS=2025,2024 npm run etl                # anos específicos
 *   ETL_DRY_RUN=1 ETL_MAX_ROWS=20000 npm run etl   # testa sem banco
 *
 * Variáveis de ambiente (detalhes em config.ts):
 *   DATABASE_URL, ETL_YEARS, ETL_BATCH_SIZE, ETL_DRY_RUN, ETL_FORCE, ETL_MAX_ROWS
 *
 * Tabelas: supabase/migrations/ (solicitacoes, etl_runs). Contrato: docs/contrato-banco-etl.md.
 */
import { CkanClient } from './ckanClient'
import { loadEtlConfig } from './config'
import { createDatabase } from './database'
import { DryRunEtlRunsRepository, EtlRunsRepository } from './repositories/etlRunsRepository'
import {
  DryRunSolicitacoesRepository,
  SolicitacoesRepository,
} from './repositories/solicitacoesRepository'
import { logYear } from './utils/logger'
import { YearSyncPipeline } from './yearSyncPipeline'

async function main() {
  const config = loadEtlConfig()
  const database = config.databaseUrl && !config.dryRun ? createDatabase(config.databaseUrl) : null

  const pipeline = new YearSyncPipeline(
    new CkanClient(),
    database ? new SolicitacoesRepository(database) : new DryRunSolicitacoesRepository(),
    database ? new EtlRunsRepository(database) : new DryRunEtlRunsRepository(),
    config
  )

  console.log(`ETL GERCON: anos ${config.years.join(', ')}${config.dryRun ? ' (dry run)' : ''}`)

  // Os anos rodam em sequência para não sobrecarregar o servidor da prefeitura.
  // Uma falha não interrompe os anos seguintes.
  const failedYears: number[] = []
  for (const ano of config.years) {
    try {
      await pipeline.syncYear(ano)
    } catch (error) {
      failedYears.push(ano)
      logYear(ano, `ERRO: ${error instanceof Error ? error.message : error}`)
    }
  }

  await database?.$client.end()
  if (failedYears.length > 0) {
    console.error(`Falharam: ${failedYears.join(', ')}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
