# GERCON Porto Alegre 2025 — Painel de Filas de Consultas (Front-end)

Painel analítico interativo desenvolvido em **Vue 3 (Composition API) + TypeScript + Vite**, projetado a partir da especificação do projeto **INF01006 (UFRGS)** para visualização da fila de consultas especializadas do **GERCON (Dados Abertos de Porto Alegre — 2025)**.

## Funcionalidades Implementadas

- **Agregação no banco (Supabase / PostgreSQL)**:
  - O ETL (`apps/etl`) carrega 100% das solicitações de cada ano a partir dos CSVs oficiais do CKAN.
  - Os indicadores são calculados por funções SQL expostas via PostgREST
    (`dashboard_filter_options` e `dashboard_data`, em `supabase/migrations/`), sobre todas as linhas do ano.
  - O front-end só envia ano, abrangência (`Porto Alegre` ou `Todo RS`) e filtros, e desenha o JSON recebido.
- **Filtros Interativos**:
  - Especialidade médica, município de residência do paciente, classificação de risco, status na fila e período cronológico de solicitação.
- **Visualizações Analíticas (Chart.js + D3.js)**:
  1. **Proporção de Status por Unidade Prestadora** (`Chart.js`, barras empilhadas absolutas ou percentuais, Top 10 / Top 15).
  2. **Tendências de Demanda Longitudinal** (`Chart.js`, série temporal semanal ou mensal, Top 5 especialidades ou total geral).
  3. **Mapa de Calor de Pressão Operacional** (`D3.js`, consultas *Aguardando* cruzando unidades por Especialidade, Classificação de Risco ou Mês, com escala sequencial Cividis).
  4. **Histograma de Tempo de Espera** (`Chart.js`, distribuição em faixas de dias com Mediana, Média, P90, P95 e Máximo).
- **Acessibilidade**:
  - Paletas seguras para daltônicos (Okabe-Ito e D3 Cividis), `aria-label` descritivos nos gráficos, navegação por teclado e tabelas acessíveis (`VoiceOver` / leitores de tela) para cada visualização.

## Como Executar

Os comandos são executados na raiz do repositório; as dependências do front-end e do ETL são instaladas juntas.

```bash
npm install
npm run dev
```

Acesse `http://localhost:5173`. O dashboard precisa de um Supabase com as migrations
aplicadas e dados carregados (veja abaixo).

## Supabase e ETL

Localmente: `npx supabase start` sobe o banco, aplica as migrations e o seed
(4 solicitações de teste por ano), e `npm run etl` carrega os dados reais
(`ETL_YEARS=2025 npm run etl` para um ano só).

Para configurar o ambiente, copie `.env.example` para `.env` na raiz do repositório e preencha os
valores. O mesmo arquivo é lido pelo front-end (`VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY`) e pelo ETL (`DATABASE_URL` e as variáveis `ETL_*`
opcionais). O Vite só expõe ao navegador as variáveis com prefixo `VITE_`.

O dashboard chama as funções RPC com a chave `anon` (somente leitura). Nunca use a chave `service_role` no front-end: ela deve permanecer
apenas no ambiente seguro do ETL.

## Organização do repositório

- `apps/web/`: dashboard Vue/Vite.
- `apps/etl/`: pipeline de carga para o PostgreSQL.
- `packages/gercon-domain/`: tipos e regras de domínio compartilhados entre o dashboard e o ETL.
- `supabase/`: migrações do banco.
- `docs/`: documentação do projeto e contrato entre o banco e o ETL.
