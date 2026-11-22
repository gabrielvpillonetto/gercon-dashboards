-- Funções RPC do dashboard: toda a agregação acontece no banco, sobre 100% das linhas do ano.
-- O front só chama via PostgREST (supabase.rpc) e desenha o JSON recebido.
--
-- dashboard_filter_options -> FilterOptions          (apps/web/src/types/gercon.ts)
-- dashboard_data           -> AggregatedDashboardData (sem computeTimeMs, medido no front)
--
-- p_escopo: 'poa' (residentes em Porto Alegre) ou 'rs' (todos os municípios).
-- p_filtros: o objeto DashboardFilters do front, em JSON.
--
-- Ainda não otimizadas: um ano inteiro (~1,5 milhão de linhas) leva vários segundos.
-- Ver 20261123000100_raise_anon_statement_timeout.sql.

CREATE OR REPLACE FUNCTION public.dashboard_filter_options(p_ano smallint, p_escopo text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH base AS MATERIALIZED (
    SELECT especialidade, municipio_residencia, classificacao_risco, data_solicitacao, data_extracao
    FROM public.solicitacoes
    WHERE ano_recurso = p_ano
      AND (p_escopo <> 'poa' OR municipio_residencia = 'PORTO ALEGRE')
  )
  SELECT jsonb_build_object(
    'especialidades', COALESCE(
      (SELECT jsonb_agg(v ORDER BY v COLLATE "pt-BR-x-icu")
       FROM (SELECT DISTINCT especialidade AS v FROM base) AS x), '[]'::jsonb),
    'municipios', COALESCE(
      (SELECT jsonb_agg(v ORDER BY v COLLATE "pt-BR-x-icu")
       FROM (SELECT DISTINCT municipio_residencia AS v FROM base) AS x), '[]'::jsonb),
    'classificacoesRisco', COALESCE(
      (SELECT jsonb_agg(v ORDER BY v COLLATE "pt-BR-x-icu")
       FROM (SELECT DISTINCT classificacao_risco AS v FROM base) AS x), '[]'::jsonb),
    'minDate', COALESCE((SELECT min(data_solicitacao) FROM base)::text, p_ano || '-01-01'),
    'maxDate', COALESCE((SELECT max(data_solicitacao) FROM base)::text, p_ano || '-12-31'),
    'dataExtracao', (SELECT max(data_extracao) FROM base)::text
  );
$$;

CREATE OR REPLACE FUNCTION public.dashboard_data(p_ano smallint, p_escopo text, p_filtros jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH
  params AS (
    SELECT
      NULLIF(p_filtros ->> 'especialidade', '') AS especialidade,
      NULLIF(p_filtros ->> 'municipio', '') AS municipio,
      NULLIF(p_filtros ->> 'classificacaoRisco', '') AS classificacao_risco,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_filtros -> 'statuses', '[]'::jsonb))) AS statuses,
      NULLIF(p_filtros ->> 'dataInicio', '')::date AS data_inicio,
      NULLIF(p_filtros ->> 'dataFim', '')::date AS data_fim,
      COALESCE(p_filtros ->> 'granularity', 'monthly') AS granularity,
      COALESCE(p_filtros ->> 'heatmapDimension', 'especialidade') AS heatmap_dimension,
      COALESCE(p_filtros ->> 'waitTimeScope', 'atendidas') AS wait_time_scope,
      COALESCE((p_filtros ->> 'topUnitsLimit')::int, 10) AS top_units_limit
  ),

  -- Empates de contagem são desempatados pelo nome (COLLATE "C"), para o resultado ser determinístico.

  -- Linhas do ano que passam em todos os filtros. Todas as seções abaixo partem daqui.
  filtrado AS MATERIALIZED (
    SELECT
      s.data_solicitacao,
      s.especialidade,
      s.especialidade_mae,
      s.classificacao_risco,
      s.unidade_solicitante,
      s.unidade_executante,
      s.status,
      s.dias_espera
    FROM public.solicitacoes AS s, params AS p
    WHERE s.ano_recurso = p_ano
      AND (p_escopo <> 'poa' OR s.municipio_residencia = 'PORTO ALEGRE')
      AND (p.especialidade IS NULL OR s.especialidade = p.especialidade)
      AND (p.municipio IS NULL OR s.municipio_residencia = p.municipio)
      AND (p.classificacao_risco IS NULL OR s.classificacao_risco = p.classificacao_risco)
      -- Nenhum ou todos os 5 status marcados = sem filtro de status.
      AND (cardinality(p.statuses) IN (0, 5) OR s.status = ANY (p.statuses))
      AND (p.data_inicio IS NULL OR s.data_solicitacao >= p.data_inicio)
      AND (p.data_fim IS NULL OR s.data_solicitacao <= p.data_fim)
  ),

  -- 1. KPIs ---------------------------------------------------------------------------------
  kpis AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE status = 'Aguardando') AS aguardando,
      count(*) FILTER (WHERE status = 'Agendado') AS agendado,
      count(*) FILTER (WHERE status = 'Atendido') AS atendido,
      count(*) FILTER (WHERE status = 'Cancelado') AS cancelado,
      count(*) FILTER (WHERE status = 'Devolvido') AS devolvido,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY dias_espera) AS mediana_espera,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY dias_espera) AS p90_espera,
      avg(dias_espera) AS media_espera,
      count(DISTINCT especialidade) AS especialidades_ativas,
      count(DISTINCT unidade_executante)
        FILTER (WHERE unidade_executante <> 'Aguardando definição de unidade') AS unidades_ativas
    FROM filtrado
  ),

  -- 2. Status por unidade executante (top N) -------------------------------------------------
  status_por_unidade AS (
    SELECT
      unidade_executante AS unit,
      count(*) AS total,
      count(*) FILTER (WHERE status = 'Aguardando') AS aguardando,
      count(*) FILTER (WHERE status = 'Agendado') AS agendado,
      count(*) FILTER (WHERE status = 'Atendido') AS atendido,
      count(*) FILTER (WHERE status = 'Cancelado') AS cancelado,
      count(*) FILTER (WHERE status = 'Devolvido') AS devolvido
    FROM filtrado
    GROUP BY unidade_executante
    ORDER BY total DESC, unidade_executante COLLATE "C"
    LIMIT (SELECT top_units_limit FROM params)
  ),

  -- 3. Série temporal (mensal ou semana ISO) com o top 5 de especialidades -----------------
  por_periodo AS (
    SELECT
      f.especialidade,
      CASE WHEN p.granularity = 'weekly'
        THEN to_char(f.data_solicitacao, 'IYYY-"S"IW')
        ELSE to_char(f.data_solicitacao, 'YYYY-MM')
      END AS chave
    FROM filtrado AS f, params AS p
  ),
  periodos AS (
    SELECT
      chave,
      count(*) AS total,
      CASE WHEN (SELECT granularity FROM params) = 'weekly'
        THEN replace(chave, '-', ' ')
        ELSE (ARRAY['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'])
               [substr(chave, 6, 2)::int] || '/' || substr(chave, 1, 4)
      END AS rotulo
    FROM por_periodo
    GROUP BY chave
  ),
  top5_especialidades AS (
    SELECT especialidade, count(*) AS total
    FROM filtrado
    GROUP BY especialidade
    ORDER BY total DESC, especialidade COLLATE "C"
    LIMIT 5
  ),
  especialidade_por_periodo AS (
    SELECT especialidade, chave, count(*) AS total
    FROM por_periodo
    WHERE especialidade IN (SELECT especialidade FROM top5_especialidades)
    GROUP BY especialidade, chave
  ),

  -- 4. Heatmap das solicitações aguardando (unidades x dimensão escolhida) ------------------
  pendentes AS (
    SELECT
      CASE WHEN f.unidade_executante <> 'Aguardando definição de unidade'
        THEN f.unidade_executante
        ELSE 'Solicitante: ' || f.unidade_solicitante
      END AS linha,
      CASE p.heatmap_dimension
        WHEN 'especialidade' THEN f.especialidade_mae
        WHEN 'risco' THEN f.classificacao_risco
        ELSE (ARRAY['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'])
               [extract(month FROM f.data_solicitacao)::int] || '/' || extract(year FROM f.data_solicitacao)
      END AS coluna,
      date_trunc('month', f.data_solicitacao) AS mes
    FROM filtrado AS f, params AS p
    WHERE f.status = 'Aguardando'
  ),
  heatmap_linhas AS (
    SELECT linha, row_number() OVER (ORDER BY count(*) DESC, linha COLLATE "C") AS ordem
    FROM pendentes
    GROUP BY linha
    ORDER BY ordem
    LIMIT 12
  ),
  heatmap_colunas AS (
    -- Por mês: todos os meses em ordem cronológica. Senão: as 8 colunas com mais pendências.
    SELECT
      coluna,
      row_number() OVER (
        ORDER BY
          CASE WHEN (SELECT heatmap_dimension FROM params) = 'mes' THEN min(mes) END,
          count(*) DESC,
          coluna COLLATE "C"
      ) AS ordem
    FROM pendentes
    GROUP BY coluna
    ORDER BY ordem
    LIMIT (SELECT CASE WHEN heatmap_dimension = 'mes' THEN NULL ELSE 8 END FROM params)
  ),
  heatmap_celulas AS (
    SELECT l.linha, c.coluna, l.ordem AS ordem_linha, c.ordem AS ordem_coluna, COALESCE(n.total, 0) AS valor
    FROM heatmap_linhas AS l
    CROSS JOIN heatmap_colunas AS c
    LEFT JOIN (
      SELECT linha, coluna, count(*) AS total FROM pendentes GROUP BY linha, coluna
    ) AS n ON n.linha = l.linha AND n.coluna = c.coluna
  ),

  -- 5. Histograma do tempo de espera ---------------------------------------------------------
  esperas AS (
    SELECT f.dias_espera AS dias
    FROM filtrado AS f, params AS p
    WHERE f.dias_espera IS NOT NULL
      AND (p.wait_time_scope = 'todas' OR f.status = 'Atendido')
  ),
  faixas (ordem, label, short_label) AS (
    VALUES
      (1, '0 a 7 dias', '0–7d'),
      (2, '8 a 15 dias', '8–15d'),
      (3, '16 a 30 dias', '16–30d'),
      (4, '31 a 60 dias', '31–60d'),
      (5, '61 a 90 dias', '61–90d'),
      (6, '91 a 180 dias', '91–180d'),
      (7, '181 a 365 dias', '181–365d'),
      (8, 'Mais de 365 dias', '> 365d')
  ),
  contagem_por_faixa AS (
    SELECT
      CASE
        WHEN dias <= 7 THEN 1 WHEN dias <= 15 THEN 2 WHEN dias <= 30 THEN 3 WHEN dias <= 60 THEN 4
        WHEN dias <= 90 THEN 5 WHEN dias <= 180 THEN 6 WHEN dias <= 365 THEN 7 ELSE 8
      END AS ordem,
      count(*) AS total
    FROM esperas
    GROUP BY 1
  ),
  estatisticas_espera AS (
    SELECT
      count(*) AS amostra,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY dias) AS mediana,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY dias) AS p90,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY dias) AS p95,
      avg(dias) AS media,
      max(dias) AS maximo
    FROM esperas
  )

  SELECT jsonb_build_object(
    'kpis', (
      SELECT jsonb_build_object(
        'total', total,
        'aguardando', aguardando,
        'agendado', agendado,
        'atendido', atendido,
        'cancelado', cancelado,
        'devolvido', devolvido,
        'taxaAtendimento', CASE WHEN total > 0 THEN atendido * 100.0 / total ELSE 0 END,
        'taxaAguardando', CASE WHEN total > 0 THEN aguardando * 100.0 / total ELSE 0 END,
        'medianaEspera', round(mediana_espera::numeric),
        'p90Espera', round(p90_espera::numeric),
        'mediaEspera', round(media_espera),
        'especialidadesAtivas', especialidades_ativas,
        'unidadesExecutantesAtivas', unidades_ativas
      )
      FROM kpis
    ),

    'statusByUnit', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'unit', unit,
          'total', total,
          'counts', jsonb_build_object(
            'Aguardando', aguardando,
            'Agendado', agendado,
            'Atendido', atendido,
            'Cancelado', cancelado,
            'Devolvido', devolvido
          )
        )
        ORDER BY total DESC, unit COLLATE "C"
      )
      FROM status_por_unidade
    ), '[]'::jsonb),

    'timeSeries', jsonb_build_object(
      'labels', COALESCE((SELECT jsonb_agg(rotulo ORDER BY chave) FROM periodos), '[]'::jsonb),
      'totalSeries', COALESCE((SELECT jsonb_agg(total ORDER BY chave) FROM periodos), '[]'::jsonb),
      'topSpecialties', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'label', t.especialidade,
            'values', (
              SELECT jsonb_agg(COALESCE(e.total, 0) ORDER BY pr.chave)
              FROM periodos AS pr
              LEFT JOIN especialidade_por_periodo AS e
                ON e.chave = pr.chave AND e.especialidade = t.especialidade
            )
          )
          ORDER BY t.total DESC, t.especialidade COLLATE "C"
        )
        FROM top5_especialidades AS t
      ), '[]'::jsonb)
    ),

    'heatmap', jsonb_build_object(
      'rows', COALESCE((SELECT jsonb_agg(linha ORDER BY ordem) FROM heatmap_linhas), '[]'::jsonb),
      'cols', COALESCE((SELECT jsonb_agg(coluna ORDER BY ordem) FROM heatmap_colunas), '[]'::jsonb),
      'cells', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object('row', linha, 'col', coluna, 'value', valor)
          ORDER BY ordem_linha, ordem_coluna
        )
        FROM heatmap_celulas
      ), '[]'::jsonb),
      'maxValue', COALESCE((SELECT max(valor) FROM heatmap_celulas), 0),
      'totalPending', (SELECT count(*) FROM pendentes),
      'dimensionLabel', CASE (SELECT heatmap_dimension FROM params)
        WHEN 'especialidade' THEN 'Especialidade'
        WHEN 'risco' THEN 'Classificação de Risco'
        ELSE 'Mês da Solicitação'
      END
    ),

    'waitTimeHistogram', (
      SELECT jsonb_build_object(
        'buckets', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'label', fx.label,
              'shortLabel', fx.short_label,
              'count', COALESCE(c.total, 0),
              'percentage', CASE WHEN est.amostra > 0 THEN COALESCE(c.total, 0) * 100.0 / est.amostra ELSE 0 END
            )
            ORDER BY fx.ordem
          )
          FROM faixas AS fx
          LEFT JOIN contagem_por_faixa AS c ON c.ordem = fx.ordem
        ),
        'sampleCount', est.amostra,
        'median', round(est.mediana::numeric),
        'p90', round(est.p90::numeric),
        'p95', round(est.p95::numeric),
        'mean', round(est.media),
        'max', est.maximo
      )
      FROM estatisticas_espera AS est
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_filter_options(smallint, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_data(smallint, text, jsonb) TO anon, authenticated;
