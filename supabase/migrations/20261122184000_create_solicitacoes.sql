CREATE TABLE public.solicitacoes (
  ano_recurso smallint NOT NULL CHECK (ano_recurso BETWEEN 2000 AND 2100),
  idsolicitacao bigint NOT NULL CHECK (idsolicitacao > 0),
  ckan_resource_id uuid NOT NULL,
  ckan_id bigint,
  data_extracao date,
  data_solicitacao date NOT NULL,
  data_agendamento date,
  especialidade text NOT NULL,
  especialidade_mae text NOT NULL,
  cid text NOT NULL,
  classificacao_risco text NOT NULL,
  municipio_residencia text NOT NULL,
  unidade_solicitante text NOT NULL,
  unidade_executante text NOT NULL,
  status_bruto text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('Aguardando', 'Agendado', 'Atendido', 'Cancelado', 'Devolvido')
  ),
  dias_espera smallint CHECK (dias_espera BETWEEN 0 AND 3650),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ano_recurso, idsolicitacao)
);

CREATE INDEX solicitacoes_ano_data_status_idx
  ON public.solicitacoes (ano_recurso, data_solicitacao, status);
CREATE INDEX solicitacoes_ano_especialidade_idx
  ON public.solicitacoes (ano_recurso, especialidade);
CREATE INDEX solicitacoes_ano_municipio_idx
  ON public.solicitacoes (ano_recurso, municipio_residencia);
CREATE INDEX solicitacoes_ano_risco_idx
  ON public.solicitacoes (ano_recurso, classificacao_risco);
CREATE INDEX solicitacoes_ano_unidade_executante_idx
  ON public.solicitacoes (ano_recurso, unidade_executante);

ALTER TABLE public.solicitacoes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.solicitacoes TO anon, authenticated;
GRANT ALL ON public.solicitacoes TO service_role;

CREATE POLICY solicitacoes_public_read
  ON public.solicitacoes
  FOR SELECT
  TO anon, authenticated
  USING (true);
