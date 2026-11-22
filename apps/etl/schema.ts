import {
  bigint,
  date,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import type { NormalizedStatus } from '../../packages/gercon-domain'

/*
 * Models do Drizzle espelhando as tabelas de supabase/migrations/.
 * As migrations do Supabase são a fonte de verdade: ao mudar uma, atualize o model correspondente.
 * Índices, RLS e CHECKs ficam só nas migrations; aqui entra apenas o que o ORM precisa para as queries.
 *
 * Colunas date e timestamp (sem fuso) usam mode 'string' ("2025-02-07"), para evitar
 * deslocamento de fuso ao converter para Date. Colunas timestamptz viram Date normalmente.
 */

export const solicitacoes = pgTable(
  'solicitacoes',
  {
    anoRecurso: smallint('ano_recurso').notNull(),
    idsolicitacao: bigint('idsolicitacao', { mode: 'number' }).notNull(),
    ckanResourceId: uuid('ckan_resource_id').notNull(),
    ckanId: bigint('ckan_id', { mode: 'number' }),
    dataExtracao: date('data_extracao', { mode: 'string' }),
    dataSolicitacao: date('data_solicitacao', { mode: 'string' }).notNull(),
    dataAgendamento: date('data_agendamento', { mode: 'string' }),
    especialidade: text('especialidade').notNull(),
    especialidadeMae: text('especialidade_mae').notNull(),
    cid: text('cid').notNull(),
    classificacaoRisco: text('classificacao_risco').notNull(),
    municipioResidencia: text('municipio_residencia').notNull(),
    unidadeSolicitante: text('unidade_solicitante').notNull(),
    unidadeExecutante: text('unidade_executante').notNull(),
    statusBruto: text('status_bruto').notNull(),
    status: text('status').$type<NormalizedStatus>().notNull(),
    diasEspera: smallint('dias_espera'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.anoRecurso, table.idsolicitacao] })]
)

export type EtlRunStatus = 'running' | 'success' | 'error'

export const etlRuns = pgTable('etl_runs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  anoRecurso: smallint('ano_recurso').notNull(),
  ckanResourceId: uuid('ckan_resource_id').notNull(),
  resourceLastModified: timestamp('resource_last_modified', { mode: 'string' }),
  status: text('status').$type<EtlRunStatus>().notNull().default('running'),
  linhasLidas: integer('linhas_lidas').notNull().default(0),
  linhasGravadas: integer('linhas_gravadas').notNull().default(0),
  linhasRejeitadas: integer('linhas_rejeitadas').notNull().default(0),
  linhasRemovidas: integer('linhas_removidas').notNull().default(0),
  erro: text('erro'),
  iniciadoEm: timestamp('iniciado_em', { withTimezone: true }).notNull().defaultNow(),
  finalizadoEm: timestamp('finalizado_em', { withTimezone: true }),
})

/** Linha de public.solicitacoes pronta para inserir. */
export type SolicitacaoRow = typeof solicitacoes.$inferInsert
