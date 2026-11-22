INSERT INTO public.solicitacoes (
  ano_recurso,
  idsolicitacao,
  ckan_resource_id,
  ckan_id,
  data_extracao,
  data_solicitacao,
  data_agendamento,
  especialidade,
  especialidade_mae,
  cid,
  classificacao_risco,
  municipio_residencia,
  unidade_solicitante,
  unidade_executante,
  status_bruto,
  status,
  dias_espera
)
VALUES
  (
    2025, 9000001, 'c0ed7103-fcbd-438e-a0c6-dd030248a1e0', NULL,
    '2026-11-22', '2025-01-15', NULL,
    'DADO DE TESTE - Cardiologia', 'DADO DE TESTE - Cardiologia',
    'I10', 'Amarelo (Prioritário)', 'PORTO ALEGRE',
    'DADO DE TESTE - UBS Centro', 'DADO DE TESTE - Unidade Norte',
    'AGUARDANDO', 'Aguardando', 45
  ),
  (
    2025, 9000002, 'c0ed7103-fcbd-438e-a0c6-dd030248a1e0', NULL,
    '2026-11-22', '2025-03-10', '2025-05-20',
    'DADO DE TESTE - Oftalmologia', 'DADO DE TESTE - Oftalmologia',
    'H40', 'Verde (Pouco Urgente)', 'PORTO ALEGRE',
    'DADO DE TESTE - UBS Sul', 'DADO DE TESTE - Unidade Centro',
    'AGENDADA', 'Agendado', 71
  ),
  (
    2025, 9000003, 'c0ed7103-fcbd-438e-a0c6-dd030248a1e0', NULL,
    '2026-11-22', '2025-06-02', '2025-07-14',
    'DADO DE TESTE - Ortopedia', 'DADO DE TESTE - Ortopedia',
    'M25', 'Vermelho (Urgente)', 'PORTO ALEGRE',
    'DADO DE TESTE - UBS Leste', 'DADO DE TESTE - Unidade Sul',
    'REALIZADA', 'Atendido', 42
  ),
  (
    2025, 9000004, 'c0ed7103-fcbd-438e-a0c6-dd030248a1e0', NULL,
    '2026-11-22', '2025-09-18', NULL,
    'DADO DE TESTE - Dermatologia', 'DADO DE TESTE - Dermatologia',
    'L30', 'Azul (Eletivo)', 'CANOAS',
    'DADO DE TESTE - UBS Norte', 'DADO DE TESTE - Unidade Leste',
    'CANCELADA', 'Cancelado', 23
  )
ON CONFLICT (ano_recurso, idsolicitacao) DO NOTHING;

-- As mesmas 4 solicitações de teste, replicadas para os demais anos do GERCON (2017–2024 e 2026),
-- para que o dashboard encontre dados em qualquer ano selecionado no ambiente local.
-- idsolicitacao = 9000000 + (ano - 2000) * 100 + n  (ex.: 9001701 a 9001704 em 2017)
INSERT INTO public.solicitacoes (
  ano_recurso,
  idsolicitacao,
  ckan_resource_id,
  ckan_id,
  data_extracao,
  data_solicitacao,
  data_agendamento,
  especialidade,
  especialidade_mae,
  cid,
  classificacao_risco,
  municipio_residencia,
  unidade_solicitante,
  unidade_executante,
  status_bruto,
  status,
  dias_espera
)
SELECT
  anos.ano,
  9000000 + (anos.ano - 2000) * 100 + modelo.n,
  anos.ckan_resource_id,
  NULL,
  DATE '2026-11-22',
  make_date(anos.ano, modelo.mes, modelo.dia),
  make_date(anos.ano, modelo.mes, modelo.dia) + modelo.dias_ate_agendamento,
  modelo.especialidade,
  modelo.especialidade,
  modelo.cid,
  modelo.classificacao_risco,
  modelo.municipio_residencia,
  modelo.unidade_solicitante,
  modelo.unidade_executante,
  modelo.status_bruto,
  modelo.status,
  modelo.dias_espera
FROM (
  VALUES
    (2017, '18d2245c-dd65-41ee-90b3-1b2b1af83976'::uuid),
    (2018, '1a3095be-7ff2-426f-87da-9e2acf484396'::uuid),
    (2019, 'fe2226c6-a63d-496b-9fb8-682f1341ac62'::uuid),
    (2020, '705574ea-e447-440c-b2d1-8834030bbac3'::uuid),
    (2021, '23d461c2-db71-46bc-896b-8b9b086531d9'::uuid),
    (2022, '8df327bf-3f9f-4a56-a077-74268e127ebc'::uuid),
    (2023, 'ab48ad6a-846e-4adc-866e-f18c094cd784'::uuid),
    (2024, '09e4bc46-a2f2-4f79-83a6-0e1c90efc0b3'::uuid),
    (2026, '518effb3-f598-4d06-afa4-dec06c2a41bf'::uuid)
) AS anos (ano, ckan_resource_id)
CROSS JOIN (
  VALUES
    (1, 1, 15, NULL::int, 'DADO DE TESTE - Cardiologia', 'I10', 'Amarelo (Prioritário)', 'PORTO ALEGRE',
     'DADO DE TESTE - UBS Centro', 'DADO DE TESTE - Unidade Norte', 'AGUARDANDO', 'Aguardando', 45),
    (2, 3, 10, 71, 'DADO DE TESTE - Oftalmologia', 'H40', 'Verde (Pouco Urgente)', 'PORTO ALEGRE',
     'DADO DE TESTE - UBS Sul', 'DADO DE TESTE - Unidade Centro', 'AGENDADA', 'Agendado', 71),
    (3, 6, 2, 42, 'DADO DE TESTE - Ortopedia', 'M25', 'Vermelho (Urgente)', 'PORTO ALEGRE',
     'DADO DE TESTE - UBS Leste', 'DADO DE TESTE - Unidade Sul', 'REALIZADA', 'Atendido', 42),
    (4, 9, 18, NULL::int, 'DADO DE TESTE - Dermatologia', 'L30', 'Azul (Eletivo)', 'CANOAS',
     'DADO DE TESTE - UBS Norte', 'DADO DE TESTE - Unidade Leste', 'CANCELADA', 'Cancelado', 23)
) AS modelo (
  n, mes, dia, dias_ate_agendamento, especialidade, cid, classificacao_risco, municipio_residencia,
  unidade_solicitante, unidade_executante, status_bruto, status, dias_espera
)
ON CONFLICT (ano_recurso, idsolicitacao) DO NOTHING;
