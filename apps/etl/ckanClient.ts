import { Readable, pipeline } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import { parse } from 'csv-parse'
import { fetchWithRetry } from './utils/fetchWithRetry'

export interface CkanResourceMetadata {
  csvUrl: string
  /** Muda sempre que a prefeitura publica um CSV novo para o recurso. */
  lastModified: string | null
}

/** Linha do CSV do GERCON, indexada pelo nome da coluna do cabeçalho. */
export type GerconCsvRecord = Record<string, string | undefined>

/** Acesso ao portal de Dados Abertos de Porto Alegre (CKAN). */
export class CkanClient {
  constructor(private readonly apiBaseUrl = 'https://dadosabertos.poa.br/api/3/action') {}

  async getResourceMetadata(resourceId: string): Promise<CkanResourceMetadata> {
    const response = await fetchWithRetry(`${this.apiBaseUrl}/resource_show?id=${resourceId}`)
    const body = (await response.json()) as {
      result: { url: string; last_modified: string | null }
    }
    return { csvUrl: body.result.url, lastModified: body.result.last_modified }
  }

  /** Baixa o CSV em streaming e devolve as linhas uma a uma, sem carregar o arquivo inteiro na memória. */
  async openCsvRecordStream(csvUrl: string, signal: AbortSignal): Promise<AsyncIterable<GerconCsvRecord>> {
    const response = await fetchWithRetry(csvUrl, signal)
    const csvParser = parse({ columns: true, delimiter: ';', bom: true, relax_quotes: true, trim: true })

    // pipeline() repassa erros do download para o parser, e eles aparecem em quem itera o stream.
    // O callback vazio só silencia o erro esperado quando a leitura é abortada de propósito.
    pipeline(Readable.fromWeb(response.body as ReadableStream), csvParser, () => {})
    return csvParser
  }
}
