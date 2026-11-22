-- Histórico das execuções do ETL: uma linha por ano processado.
-- O ETL usa resource_last_modified para pular anos cujo CSV não mudou desde a última carga completa.
CREATE TABLE public.etl_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ano_recurso smallint NOT NULL CHECK (ano_recurso BETWEEN 2000 AND 2100),
  ckan_resource_id uuid NOT NULL,
  resource_last_modified timestamp,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  linhas_lidas integer NOT NULL DEFAULT 0,
  linhas_gravadas integer NOT NULL DEFAULT 0,
  linhas_rejeitadas integer NOT NULL DEFAULT 0,
  linhas_removidas integer NOT NULL DEFAULT 0,
  erro text,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz
);

CREATE INDEX etl_runs_ano_iniciado_idx
  ON public.etl_runs (ano_recurso, iniciado_em DESC);

-- Sem política de leitura pública: só o ETL (service_role / postgres) acessa.
ALTER TABLE public.etl_runs ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.etl_runs TO service_role;
