<script setup lang="ts">
import { computed, onMounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import DemandTimeSeriesChart from '@/components/DemandTimeSeriesChart.vue'
import FilterBar from '@/components/FilterBar.vue'
import InitLoader from '@/components/InitLoader.vue'
import KpiCards from '@/components/KpiCards.vue'
import OperationalHeatmap from '@/components/OperationalHeatmap.vue'
import StatusByUnitChart from '@/components/StatusByUnitChart.vue'
import WaitTimeHistogramChart from '@/components/WaitTimeHistogramChart.vue'
import { useGerconData } from '@/composables/useGerconData'
import { GERCON_RESOURCES_BY_YEAR } from '../../../packages/gercon-domain'

const {
  selectedYear,
  selectedScope,
  status,
  isComputing,
  errorMessage,
  dataExtracao,
  filterOptions,
  filters,
  aggregated,
  initialize,
  switchYear,
  switchScope,
  resetFilters,
} = useGerconData()

const activeResourceId = computed(() => GERCON_RESOURCES_BY_YEAR[selectedYear.value])

onMounted(() => {
  void initialize()
})
</script>

<template>
  <a href="#main-content" class="skip-link">Pular para o conteúdo principal</a>

  <AppHeader
    :selected-year="selectedYear"
    :selected-scope="selectedScope"
    :data-extracao="dataExtracao"
    :is-busy="status === 'loading'"
    @select-year="(yr) => switchYear(yr)"
    @select-scope="(scope) => switchScope(scope)"
  />

  <main id="main-content" class="app-container" tabindex="-1">
    <InitLoader
      v-if="status !== 'ready' || !aggregated"
      :year="selectedYear"
      :status="status === 'error' ? 'error' : 'loading'"
      :error-message="errorMessage"
      @retry="initialize"
    />

    <template v-else>
      <FilterBar
        :filters="filters"
        :options="filterOptions"
        :compute-time-ms="aggregated.computeTimeMs"
        :is-computing="isComputing"
        @reset="resetFilters"
      />

      <KpiCards :kpis="aggregated.kpis" />

      <section class="dashboard-grid" aria-label="Visualizações analíticas da fila GERCON">
        <div class="col-6">
          <StatusByUnitChart
            :rows="aggregated.statusByUnit"
            :top-limit="filters.topUnitsLimit"
            @update:top-limit="(val) => (filters.topUnitsLimit = val)"
          />
        </div>

        <div class="col-6">
          <DemandTimeSeriesChart
            :data="aggregated.timeSeries"
            :granularity="filters.granularity"
            @update:granularity="(val) => (filters.granularity = val)"
          />
        </div>

        <div class="col-12">
          <OperationalHeatmap
            :data="aggregated.heatmap"
            :dimension="filters.heatmapDimension"
            @update:dimension="(val) => (filters.heatmapDimension = val)"
          />
        </div>

        <div class="col-12">
          <WaitTimeHistogramChart
            :data="aggregated.waitTimeHistogram"
            :scope="filters.waitTimeScope"
            @update:scope="(val) => (filters.waitTimeScope = val)"
          />
        </div>
      </section>

      <footer class="app-footer">
        <p>
          <strong>Fonte:</strong> Dados Abertos de Porto Alegre — GERCON {{ selectedYear }} (CKAN
          Resource <code>{{ activeResourceId }}</code>).
          <span v-if="dataExtracao">
            Última extração na base oficial: <strong>{{ dataExtracao }}</strong>.
          </span>
        </p>
        <p>
          INF01006 — Projeto de Banco de Dados (UFRGS) • Front-end Vue 3 + TypeScript + Chart.js +
          D3.js • Indicadores agregados no Supabase (PostgreSQL) sobre 100% das solicitações.
        </p>
      </footer>
    </template>
  </main>
</template>

<style scoped>
.app-footer {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
  font-size: 0.8rem;
  color: var(--text-muted);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
}

.app-footer p {
  margin: 0;
}

.app-footer code {
  background: var(--bg-subtle);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.76rem;
}
</style>
