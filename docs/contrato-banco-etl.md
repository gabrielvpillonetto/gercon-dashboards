# Contrato inicial do banco e do ETL

A migração `supabase/migrations/20261122184000_create_solicitacoes.sql` cria
`public.solicitacoes` para armazenar os registros completos dos recursos anuais
do GERCON. O banco guarda dados de todos os municípios; o recorte de Porto
Alegre deve ser aplicado pelo dashboard usando `municipio_residencia`.

## Chave e carga

- Chave primária: `(ano_recurso, idsolicitacao)`.
- `ano_recurso` é o ano do recurso CKAN de origem, não deve ser inferido de
  `data_solicitacao`.
- `idsolicitacao` é o identificador da solicitação no GERCON. As consultas aos
  recursos de 2017 a 2026 encontraram IDs preenchidos e distintos dentro de
  cada ano. Isso não comprova estabilidade entre versões futuras do CKAN.
- `ckan_resource_id` e `ckan_id` guardam a procedência da linha; `_id` do CKAN
  não substitui `idsolicitacao` como chave da solicitação.
- A carga deve ser idempotente usando `INSERT ... ON CONFLICT
  (ano_recurso, idsolicitacao) DO UPDATE`, atualizando os campos da linha e
  `updated_at`. Não usar amostras limitadas na carga do banco.

## Colunas

| Coluna | Tipo | Origem / regra |
|---|---|---|
| `ano_recurso` | `smallint` | Ano do recurso CKAN (2017–2026 nos recursos verificados). |
| `idsolicitacao` | `bigint` | Identificador GERCON; parte da chave primária. |
| `ckan_resource_id` | `uuid` | UUID do recurso CKAN usado na extração. |
| `ckan_id` | `bigint` | `_id` da linha no CKAN, apenas para rastreabilidade. |
| `data_extracao` | `date` | `data_extracao` do recurso, quando disponível. |
| `data_solicitacao` | `date` | Data de solicitação; obrigatória. |
| `data_agendamento` | `date` | Data de `datahora_consulta`; pode ser nula. |
| `especialidade` | `text` | Especialidade solicitada; usar `Não informada` quando vazia. |
| `especialidade_mae` | `text` | Especialidade agrupadora; usar a especialidade quando vazia. |
| `cid` | `text` | Código CID; usar `—` quando vazio, conforme o modelo atual. |
| `classificacao_risco` | `text` | Rótulo normalizado pelo dashboard, como `Amarelo (Prioritário)` ou `Não classificado`. |
| `municipio_residencia` | `text` | Município de residência; usar `Não informado` quando vazio. |
| `unidade_solicitante` | `text` | `unidadesolicitante`; usar `Não informada` quando vazio. |
| `unidade_executante` | `text` | `unidadeexecutante`; usar `Aguardando definição de unidade` quando vazio. |
| `status_bruto` | `text` | Valor original de `situacaosolicitacao`; usar `DESCONHECIDO` quando vazio. |
| `status` | `text` | Uma das categorias: `Aguardando`, `Agendado`, `Atendido`, `Cancelado`, `Devolvido`. |
| `dias_espera` | `smallint` | Diferença entre as datas quando possível; caso contrário, `diasfilaespera`; intervalo `0..3650` ou nulo. |
| `created_at` | `timestamptz` | Preenchido pelo banco na primeira inserção. |
| `updated_at` | `timestamptz` | O ETL deve definir `now()` em cada inserção/atualização. |

O dashboard atual ainda lê CKAN diretamente e usa `_id` em seu tipo local.
Esta tabela estabelece o contrato para o ETL e para a futura integração com
PostgREST; não altera o cliente atual.

## Acesso

A política RLS permite leitura a `anon` e `authenticated`, pois os registros
vêm de uma fonte pública. Escritas devem ocorrer pelo ETL com a chave
`service_role`, mantida somente em ambiente seguro do pipeline e nunca no
front-end.
