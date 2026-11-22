-- Esquema PROVISÓRIO do ETL GERCON.
-- Serve para desenvolver o pipeline enquanto o banco Supabase definitivo não fica pronto.
-- O mapeamento coluna -> valor fica em COLUMNS, dentro de etl/index.ts; ao trocar o esquema, ajuste os dois.

create schema if not exists gercon;

do $$ begin
  create type gercon.status_normalizado as enum ('Aguardando', 'Agendado', 'Atendido', 'Cancelado', 'Devolvido');
exception when duplicate_object then null;
end $$;

-- Uma linha por execução do ETL e por ano.
create table if not exists gercon.etl_runs (
  id                     bigint generated always as identity primary key,
  ano                    smallint    not null,
  resource_id            text        not null,
  resource_last_modified timestamp,
  status                 text        not null default 'running' check (status in ('running', 'success', 'error')),
  linhas_lidas           integer     not null default 0,
  linhas_gravadas        integer     not null default 0,
  linhas_rejeitadas      integer     not null default 0,
  linhas_removidas       integer     not null default 0,
  erro                   text,
  iniciado_em            timestamptz not null default now(),
  finalizado_em          timestamptz
);

create index if not exists etl_runs_ano_idx on gercon.etl_runs (ano, iniciado_em desc);

-- Tabela fato: uma linha por solicitação de consulta.
-- Strings vazias da fonte viram NULL; os rótulos de exibição ficam a cargo de views/front.
create table if not exists gercon.solicitacoes (
  ano                  smallint    not null,
  id_solicitacao       bigint      not null,
  data_extracao        date,
  data_solicitacao     date        not null,
  data_consulta        date,
  status_bruto         text        not null,
  status               gercon.status_normalizado not null,
  classificacao_risco  text,       -- VERMELHO | LARANJA | AMARELO | VERDE | AZUL | NULL (NENHUM)
  complexidade         text,
  especialidade        text,
  especialidade_mae    text,
  cid                  text,
  idade                smallint,
  municipio_residencia text,
  cnes_solicitante     integer,
  unidade_solicitante  text,
  cnes_executante      integer,
  unidade_executante   text,       -- NULL enquanto a unidade não é definida
  municipio_executante text,
  tipo_consulta        text,
  dias_fila_fonte      integer,    -- diasfilaespera como veio da fonte
  dias_espera          integer,    -- data_consulta - data_solicitacao (ou dias_fila_fonte)
  etl_run_id           bigint      not null references gercon.etl_runs (id),
  primary key (ano, id_solicitacao)
);

create index if not exists solicitacoes_ano_data_status_idx on gercon.solicitacoes (ano, data_solicitacao, status);
create index if not exists solicitacoes_especialidade_idx   on gercon.solicitacoes (especialidade);
create index if not exists solicitacoes_municipio_idx       on gercon.solicitacoes (municipio_residencia);
create index if not exists solicitacoes_unidade_exec_idx    on gercon.solicitacoes (unidade_executante);
create index if not exists solicitacoes_risco_idx           on gercon.solicitacoes (classificacao_risco);
create index if not exists solicitacoes_run_idx             on gercon.solicitacoes (etl_run_id);
