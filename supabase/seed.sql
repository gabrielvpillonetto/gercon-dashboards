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
    'I10', 'AMARELO', 'PORTO ALEGRE',
    'DADO DE TESTE - UBS Centro', 'DADO DE TESTE - Unidade Norte',
    'AGUARDANDO', 'Aguardando', 45
  ),
  (
    2025, 9000002, 'c0ed7103-fcbd-438e-a0c6-dd030248a1e0', NULL,
    '2026-11-22', '2025-03-10', '2025-05-20',
    'DADO DE TESTE - Oftalmologia', 'DADO DE TESTE - Oftalmologia',
    'H40', 'VERDE', 'PORTO ALEGRE',
    'DADO DE TESTE - UBS Sul', 'DADO DE TESTE - Unidade Centro',
    'AGENDADA', 'Agendado', 71
  ),
  (
    2025, 9000003, 'c0ed7103-fcbd-438e-a0c6-dd030248a1e0', NULL,
    '2026-11-22', '2025-06-02', '2025-07-14',
    'DADO DE TESTE - Ortopedia', 'DADO DE TESTE - Ortopedia',
    'M25', 'VERMELHO', 'PORTO ALEGRE',
    'DADO DE TESTE - UBS Leste', 'DADO DE TESTE - Unidade Sul',
    'REALIZADA', 'Atendido', 42
  ),
  (
    2025, 9000004, 'c0ed7103-fcbd-438e-a0c6-dd030248a1e0', NULL,
    '2026-11-22', '2025-09-18', NULL,
    'DADO DE TESTE - Dermatologia', 'DADO DE TESTE - Dermatologia',
    'L30', 'AZUL', 'CANOAS',
    'DADO DE TESTE - UBS Norte', 'DADO DE TESTE - Unidade Leste',
    'CANCELADA', 'Cancelado', 23
  )
ON CONFLICT (ano_recurso, idsolicitacao) DO NOTHING;
