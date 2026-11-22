import {
  normalizeGerconStatus,
  normalizeRiskLabel,
  type GerconYear,
} from '../../packages/gercon-domain'
import type { GerconCsvRecord } from './ckanClient'
import type { SolicitacaoRow } from './schema'
import { parseInteger, parseIsoDate, parseNonEmptyText } from './utils/parsers'
import { calculateWaitDays } from './utils/waitTime'

/**
 * Converte linhas do CSV do GERCON em linhas de public.solicitacoes,
 * seguindo as regras de docs/contrato-banco-etl.md.
 * Há uma instância por ano, porque ano e recurso CKAN valem para o arquivo inteiro.
 */
export class SolicitacaoMapper {
  constructor(
    private readonly anoRecurso: GerconYear,
    private readonly ckanResourceId: string
  ) {}

  /** Devolve null quando a linha não tem idsolicitacao válido ou data de solicitação. */
  toDatabaseRow(csv: GerconCsvRecord): SolicitacaoRow | null {
    const idSolicitacao = parseInteger(csv.idsolicitacao)
    const dataSolicitacao = parseIsoDate(csv.data_solicitacao)
    if (idSolicitacao === null || idSolicitacao <= 0 || dataSolicitacao === null) return null

    const dataAgendamento = parseIsoDate(csv.datahora_consulta)
    const statusBruto = parseNonEmptyText(csv.situacaosolicitacao)?.toUpperCase() ?? 'DESCONHECIDO'
    const especialidade = parseNonEmptyText(csv.especialidade) ?? 'Não informada'

    return {
      anoRecurso: this.anoRecurso,
      idsolicitacao: idSolicitacao,
      ckanResourceId: this.ckanResourceId,
      ckanId: null, // o CSV de upload não traz o _id do datastore CKAN
      dataExtracao: parseIsoDate(csv.data_extracao),
      dataSolicitacao: dataSolicitacao,
      dataAgendamento: dataAgendamento,
      especialidade,
      especialidadeMae: parseNonEmptyText(csv.especialidademae) ?? especialidade,
      cid: parseNonEmptyText(csv.cid) ?? '—',
      classificacaoRisco: normalizeRiskLabel(csv.corregulador),
      municipioResidencia: parseNonEmptyText(csv.municipio_residencia) ?? 'Não informado',
      unidadeSolicitante: parseNonEmptyText(csv.unidadesolicitante) ?? 'Não informada',
      unidadeExecutante:
        parseNonEmptyText(csv.unidadeexecutante) ?? 'Aguardando definição de unidade',
      statusBruto: statusBruto,
      status: normalizeGerconStatus(statusBruto),
      diasEspera: calculateWaitDays(dataSolicitacao, dataAgendamento, parseInteger(csv.diasfilaespera)),
    }
  }
}
