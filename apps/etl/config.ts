import { AVAILABLE_YEARS, type GerconYear } from '../../packages/gercon-domain'

export interface EtlConfig {
  /** Connection string do Postgres do Supabase (usuário postgres, que ignora RLS). */
  databaseUrl: string | null
  years: GerconYear[]
  /** Linhas acumuladas antes de cada gravação no banco. */
  batchSize: number
  /** Lê e normaliza os CSVs sem gravar nada no banco. */
  dryRun: boolean
  /** Reprocessa o ano mesmo que o CSV não tenha mudado desde a última carga. */
  forceReload: boolean
  /** Para a leitura de cada ano após N linhas. Só é permitido no dry run. */
  maxRowsPerYear: number
}

/** Lê as variáveis ETL_* e DATABASE_URL e falha cedo se a combinação for inválida. */
export function loadEtlConfig(env: NodeJS.ProcessEnv = process.env): EtlConfig {
  const config: EtlConfig = {
    databaseUrl: env.DATABASE_URL ?? null,
    years: env.ETL_YEARS ? parseYears(env.ETL_YEARS) : AVAILABLE_YEARS,
    batchSize: Number(env.ETL_BATCH_SIZE ?? 5000),
    dryRun: env.ETL_DRY_RUN === '1',
    forceReload: env.ETL_FORCE === '1',
    maxRowsPerYear: env.ETL_MAX_ROWS ? Number(env.ETL_MAX_ROWS) : Infinity,
  }

  if (!config.dryRun && !config.databaseUrl) {
    throw new Error('Defina DATABASE_URL, ou use ETL_DRY_RUN=1 para rodar sem banco.')
  }
  if (!config.dryRun && config.maxRowsPerYear !== Infinity) {
    throw new Error('ETL_MAX_ROWS só pode ser usado com ETL_DRY_RUN=1, porque o contrato proíbe amostras no banco.')
  }
  if (!Number.isInteger(config.batchSize) || config.batchSize <= 0) {
    throw new Error(`ETL_BATCH_SIZE inválido: ${env.ETL_BATCH_SIZE}`)
  }

  return config
}

function parseYears(value: string): GerconYear[] {
  const years = value.split(',').map((year) => Number(year.trim()))
  const invalidYears = years.filter((year) => !AVAILABLE_YEARS.includes(year as GerconYear))
  if (invalidYears.length > 0) {
    throw new Error(`Anos inválidos em ETL_YEARS: ${invalidYears.join(', ')}`)
  }
  return years as GerconYear[]
}
