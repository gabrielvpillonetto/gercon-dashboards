# GERCON Porto Alegre 2025 — Painel de Filas de Consultas (Front-end)

Painel analítico interativo desenvolvido em **Vue 3 (Composition API) + TypeScript + Vite**, projetado a partir da especificação do projeto **INF01006 (UFRGS)** para visualização da fila de consultas especializadas do **GERCON (Dados Abertos de Porto Alegre — 2025)**.

## Funcionalidades Implementadas

- **Ingestão sob demanda na primeira inicialização + Cache Local (IndexedDB)**:
  - Consulta diretamente o recurso oficial de 2025 na API CKAN de Porto Alegre (`c0ed7103-fcbd-438e-a0c6-dd030248a1e0`) via proxy do Vite (`/ckan-api`).
  - Salva os registros normalizados no **IndexedDB** do navegador (com metadados em `localStorage`), garantindo carregamento instantâneo nas próximas visitas sem refazer o download.
  - Inclui barra de progresso, tratamento amigável de erros/timeouts e opção para atualizar ou alterar a abrangência/volume de amostra (`Porto Alegre` ou `Todo RS`, `15k` / `25k` / `50k` registros).
- **Processamento em Segundo Plano (Web Worker)**:
  - Toda filtragem e agregação é executada em `apps/web/src/workers/analytics.worker.ts`, mantendo a interface responsiva (< 1s).
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

Acesse `http://localhost:5173`. Na primeira abertura, os dados de 2025 serão baixados automaticamente da API CKAN de Porto Alegre e armazenados no navegador.

## Preparação para Supabase

O SDK `@supabase/supabase-js` e o cliente em `apps/web/src/services/supabase.ts` estão
disponíveis para a futura integração com o banco. Para configurar o ambiente
local, copie `apps/web/.env.example` para `apps/web/.env.local` e preencha
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os valores do projeto.

O dashboard ainda busca os dados diretamente da API CKAN; instalar e configurar
o SDK não altera essa origem. Nunca use a chave `service_role` no front-end:
ela deve permanecer apenas no ambiente seguro do ETL.

## Organização do repositório

- `apps/web/`: dashboard Vue/Vite.
- `apps/etl/`: pipeline de carga para o PostgreSQL.
- `packages/gercon-domain/`: tipos e regras de domínio compartilhados entre o dashboard e o ETL.
- `supabase/`: migrações do banco.
- `docs/`: documentação do projeto e contrato entre o banco e o ETL.
