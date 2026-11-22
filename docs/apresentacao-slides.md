---
marp: true
theme: default
paginate: true
backgroundColor: #f8fafc
color: #102033
style: |
  section {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 48px 56px;
  }
  h1 {
    color: #005b96;
    font-size: 2.1rem;
    margin-bottom: 0.4em;
  }
  h2 {
    color: #005b96;
    font-size: 1.55rem;
    border-bottom: 3px solid #e6f2fa;
    padding-bottom: 8px;
    margin-bottom: 18px;
  }
  strong {
    color: #004574;
  }
  code {
    background: #e6f2fa;
    color: #004574;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.85em;
  }
  table {
    font-size: 0.82rem;
    width: 100%;
  }
  th {
    background: #005b96;
    color: #ffffff;
  }
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
  }
  .box {
    background: #ffffff;
    border: 1px solid #d8e0ea;
    border-top: 4px solid #005b96;
    border-radius: 10px;
    padding: 18px 20px;
  }
  .box-warn {
    border-top-color: #d55e00;
  }
  .box-ok {
    border-top-color: #009e73;
  }
  .small {
    font-size: 0.82rem;
    color: #43556b;
  }
---

# Dashboards de Filas de Consultas GERCON
### Arquitetura Atual, Limitações, Back-end Pendente e Evolução

**INF01006 — Projeto de Banco de Dados (UFRGS)**  
Professora Renata de Matos Galante  
Gabriel Viecili Pillonetto • Lucas Slongo Schiavo • Cauã Rodriguez da Silva

<!--
Notas do apresentador:
- Dar contexto rápido: já temos o protótipo funcional do front-end conectado aos dados reais do GERCON (Porto Alegre).
- Nesta apresentação vamos focar no diagnóstico honesto das limitações atuais, no desenho do back-end ainda pendente (ETL + Supabase/PostgreSQL) e no roadmap de melhorias.
-->

---

## 1. Estado Atual do Projeto (Fase 1 Concluída)

<div class="cols">
<div class="box box-ok">

### O que já funciona hoje
- **Front-end completo** em Vue 3 (Composition API) + TypeScript + Vite
- **Dados reais do GERCON** (2017–2026) via API CKAN (`dadosabertos.poa.br`)
- **Seletor multi-ano** com download sob demanda e cache por ano no **IndexedDB**
- **Web Worker** (`analytics.worker.ts`) com filtragem e agregação em `< 1s`
- **4 visualizações analíticas** (Chart.js + D3.js) + acessibilidade (Okabe-Ito, Cividis, VoiceOver)

</div>
<div class="box box-warn">

### O que ainda falta (Fase 2)
- **Pipeline ETL assíncrono** (Node.js + agendamento diário)
- **Banco PostgreSQL gerenciado** (Supabase) com carga completa dos anos
- **Views / RPCs pré-agregadas** servidas via **PostgREST**
- **Eliminação da dependência direta** da API CKAN e do proxy local do Vite

</div>
</div>

<!--
Notas do apresentador:
- Reforçar que o front-end já foi arquitetado em camadas desacopladas justamente para permitir validar UX e visualizações agora e plugar o back-end sem retrabalho.
-->

---

## 2. Arquitetura Atual vs. Arquitetura Alvo

| Dimensão | Fase 1 (Atual — Somente Front-end) | Fase 2 (Alvo — Com Back-end) |
| :--- | :--- | :--- |
| **Origem em tempo de uso** | API CKAN via proxy local (`/ckan-api`) | API PostgREST (Supabase / PostgreSQL) |
| **Cobertura de dados** | Amostra configurável (15k–50k reg./ano) | **100% da base** (~1,41M reg. em 2025) |
| **Onde ocorre a agregação** | Web Worker no navegador do usuário | Views / SQL otimizado no PostgreSQL |
| **Persistência** | IndexedDB local (por navegador) | Banco centralizado + sincronização diária |
| **Disponibilidade em produção** | Depende de proxy para contornar CORS | Deploy estático + API pública resiliente |

<!--
Notas do apresentador:
- Destacar o principal ganho da Fase 2: sair de uma amostra local de até 50 mil linhas para 100% do volume real sem sobrecarregar o navegador nem a API da prefeitura.
-->

---

## 3. Limitações Atuais — Volume e Amostragem no Cliente

- **Escala real dos dados:** apenas **2025** possui **1.410.003 registros** (e **2026** já passa de **1,55 milhão**).
- **Teto prático no navegador:** baixar e manter milhões de registros em memória/IndexedDB gera alto consumo de RAM, lentidão inicial e risco de cota de armazenamento em dispositivos móveis.
- **Consequência atual:** o front-end trabalha com lotes limitados (`15.000`, `25.000` ou `50.000` registros ordenados por `_id`), o que:
  - Pode **sub-representar meses ou especialidades** caso a ordenação da base não seja uniforme ao longo do ano.
  - Impede consultas estatísticas exatas sobre o **universo completo** da rede municipal.

<!--
Notas do apresentador:
- Este é o argumento mais forte de Banco de Dados na disciplina: por melhor que seja um Web Worker, o navegador não substitui um SGBD relacional indexado para milhões de tuplas.
-->

---

## 4. Limitações Atuais — Dependência Direta da API CKAN

<div class="cols">
<div class="box box-warn">

### Restrições Técnicas da API Pública
- **Ausência de CORS:** `dadosabertos.poa.br` não retorna `Access-Control-Allow-Origin`, exigindo o proxy do Vite em desenvolvimento.
- **Latência e Timeouts:** consultas SQL paginadas (`datastore_search_sql`) podem oscilar ou falhar sob carga.
- **Rate Limiting:** múltiplos usuários simultâneos acessando diretamente o CKAN sofreriam bloqueios (HTTP 429).

</div>
<div class="box">

### Impacto na Experiência
- **Primeira carga lenta** para cada novo ano selecionado (5 a 10 lotes HTTP sequenciais).
- **Cache isolado por dispositivo:** cada usuário precisa baixar os dados novamente no seu próprio navegador.
- **Sem visão multi-ano simultânea:** apenas um ano fica carregado no Web Worker por vez.

</div>
</div>

<!--
Notas do apresentador:
- Explicar que em produção (ex.: Vercel/Netlify) não há proxy de dev do Vite; portanto, o back-end no Supabase também resolve o problema de CORS e rate limit de forma definitiva.
-->

---

## 5. Limitações Atuais — Qualidade e Semântica dos Dados

- **Unidade executante ausente em filas pendentes:** solicitações ainda em regulação (`AGUARDA_REGULACAO`, `PENDENTE`) frequentemente vêm com `unidadeexecutante = ""`.
  - *Contorno atual:* agrupamento pela unidade solicitante no mapa de calor e rótulo explícito *"Aguardando definição de unidade"*.
- **Consolidação de 16 status brutos em 5 categorias:** útil para visão executiva, mas oculta nuances operacionais (ex.: `AGUARDA_MATRICIAMENTO` vs. `ENCAMINHADA_AO_NIR`).
- **Tempo de espera:** registros cancelados ou sem `datahora_consulta` dependem do campo `diasfilaespera` calculado na data de extração, exigindo cuidado interpretativo.
- **Diferenças entre anos antigos (2017–2021):** possíveis variações de colunas ou padronização de nomes de unidades/especialidades (atualmente mitigado com fallback `SELECT *`).

<!--
Notas do apresentador:
- Mostrar maturidade crítica sobre dados públicos reais: dados abertos raramente vêm "limpos"; o ETL no back-end é o lugar certo para aplicar regras consistentes de limpeza e auditoria.
-->

---

## 6. O Back-end Incompleto — Arquitetura Planejada

O que foi especificado no artigo do projeto e será implementado na **Fase 2**:

1. **Worker ETL Assíncrono (Node.js + TypeScript)**
   - Executado diariamente via **GitHub Actions (cron job)** ou agendador equivalente.
   - **Extração:** download do CSV oficial ou lotes incrementais da API CKAN.
   - **Transformação:** normalização de datas, status, risco, limpeza de strings, cálculo padronizado de `dias_espera` e deduplicação por `idsolicitacao`.
   - **Carga:** `COPY` / *upsert* em lote no PostgreSQL (Supabase) com log de execução e versão de extração.

2. **Camada de Dados e API (Supabase / PostgreSQL + PostgREST)**
   - Armazenamento centralizado de **todos os anos completos** (milhões de linhas).
   - Exposição segura somente leitura (`RLS` / políticas públicas para dashboards) via **PostgREST**.

<!--
Notas do apresentador:
- Destacar que o CSV oficial (~300–500 MB) é muito mais eficiente para ingestão em lote via streaming no Node.js do que centenas de chamadas paginadas ao CKAN.
-->

---

## 7. Modelagem de Banco de Dados Planejada (PostgreSQL)

<div class="cols">
<div class="box">

### Esquema e Otimização Física
- **Tabela principal `solicitacoes`** (ou particionada por `ano_solicitacao`):
  - Chave natural/única: `(ano, idsolicitacao)`
  - Dimensões normalizadas (opcional): `especialidades`, `unidades`, `municipios`
- **Índices estratégicos:**
  - Composto `(ano, data_solicitacao, status)`
  - Índices em `especialidade`, `municipio_residencia`, `unidade_executante` e `classificacao_risco`

</div>
<div class="box box-ok">

### Consultas Sub-Segundo (< 1s)
- **Materialized Views** atualizadas ao fim de cada execução do ETL:
  - `mv_status_por_unidade`
  - `mv_demanda_mensal_semanal`
  - `mv_heatmap_aguardando`
  - `mv_histograma_espera`
- **Funções RPC SQL** parametrizadas pelos filtros do usuário, retornando JSON no **mesmo contrato** de `AggregatedDashboardData`.

</div>
</div>

<!--
Notas do apresentador:
- Conectar diretamente com a disciplina INF01006: particionamento por ano, escolha de índices compostos, views materializadas vs. agregação sob demanda (RPC) para filtros arbitrários.
-->

---

## 8. Integração Limpa com o Front-end Atual

Graças ao desacoplamento já construído no Vue 3:

- **O que muda:**
  - `ckanService.ts` + `storageService.ts` + `analytics.worker.ts` são substituídos por um **`supabaseService.ts`** chamando PostgREST / RPCs.
  - `useGerconData.ts` passa a enviar os filtros reativos para o banco e receber `AggregatedDashboardData`.
- **O que permanece intacto (zero retrabalho):**
  - Todos os componentes visuais (`KpiCards`, `StatusByUnitChart`, `DemandTimeSeriesChart`, `OperationalHeatmap`, `WaitTimeHistogramChart`, `FilterBar`, `AccessibleDataTable`).
  - Contratos TypeScript (`src/types/gercon.ts`) e camada de acessibilidade.

<!--
Notas do apresentador:
- Enfatizar que investir em contratos de tipos bem definidos (`AggregatedDashboardData`) evita reescrever a interface quando o back-end entrar no ar.
-->

---

## 9. Melhorias Futuras — Produto e Análises

- **Comparativo Multi-Ano Lado a Lado:** sobrepor curvas de demanda e mediana de espera (ex.: `2024` vs. `2025` vs. `2026`) para avaliar impacto de políticas públicas.
- **Drill-down de Status e CID-10:** permitir expandir os 5 status canônicos nos 16 status brutos do GERCON e filtrar por código/grupo **CID-10** e **unidade solicitante (UBS)**.
- **Busca com Autocomplete:** substituir `<select>` nativos extensos por combobox acessível com busca para centenas de especialidades e municípios.
- **Exportação e Compartilhamento:** exportar recortes filtrados em **CSV / PNG / PDF** e sincronizar filtros na **URL (query params)** para compartilhar relatórios.
- **Alertas de Gargalo:** destacar automaticamente especialidades/unidades com crescimento anormal de espera (P90 acima da meta clínica).

<!--
Notas do apresentador:
- Mostrar visão de produto orientada aos usuários reais (coordenadores de triagem e analistas de saúde pública citados no artigo).
-->

---

## 10. Melhorias Futuras — Engenharia e Qualidade

- **Testes Automatizados:**
  - Unitários (**Vitest**) para normalização de status, cálculo de quantis e regras do ETL.
  - End-to-End (**Playwright**) cobrindo filtros, troca de ano, acessibilidade (`axe-core`) e tratamento de erro.
- **Otimização de Build e Bundle:**
  - Substituir importações barrel de ícones para reduzir tempo de build e tamanho do pacote.
- **Observabilidade do Pipeline ETL:**
  - Registro de falhas, alertas caso a estrutura do CSV do GERCON mude e painel de metadados da última sincronização oficial.
- **Deploy Contínuo (CI/CD):**
  - Front-end em hospedagem estática (Vercel / Cloudflare Pages / GitHub Pages) conectado ao Supabase em produção.

<!--
Notas do apresentador:
- Ressaltar que o build atual já passa com zero erros de TypeScript (`vue-tsc --noEmit`), criando uma base sólida para adicionar CI/CD e testes.
-->

---

## 11. Roadmap e Próximos Passos

1. **Fase 1 — Front-end & Validação Analítica** *(Concluída)*
   - Vue 3 + TypeScript + Chart.js + D3.js + Web Worker + Cache multi-ano (IndexedDB).
2. **Fase 2 — Back-end & Pipeline ETL** *(Próxima Etapa)*
   - Modelagem no Supabase (PostgreSQL), índices, views materializadas e worker ETL em Node.js + GitHub Actions.
3. **Fase 3 — Integração Total & Produção**
   - Conectar `useGerconData` ao PostgREST, remover limite de amostra de 50k e publicar com CI/CD.
4. **Fase 4 — Recursos Avançados**
   - Comparação interanual, drill-down CID-10/UBS, exportação de relatórios e testes E2E.

---

### Obrigado! Perguntas?

<p class="small">
Repositório: front-end Vue 3 + TypeScript • Dados Abertos GERCON Porto Alegre (2017–2026)
</p>

<!--
Notas do apresentador:
- Abrir para perguntas da professora e colegas, podendo voltar para o protótipo rodando ao vivo se quiserem testar algum filtro ou troca de ano.
-->
