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
import { GERCON_RESOURCES_BY_YEAR } from '@/services/ckanService'

const {
  selectedYear,
  cachedYears,
  status,
  isComputing,
  errorMessage,
  loadedFromCache,
  cacheMeta,
  progress,
  filterOptions,
  filters,
  aggregated,
  initialize,
  switchYear,
  clearAndResync,
  resetFilters,
} = useGerconData()

const activeResourceId = computed(
  () => cacheMeta.value?.resourceId ?? GERCON_RESOURCES_BY_YEAR[selectedYear.value]
)

onMounted(() => {
  void initialize()
})
</script>

<template>
  <a href="#main-content" class="skip-link">Pular para o conteúdo principal</a>

  <AppHeader
    :selected-year="selectedYear"
    :cached-years="cachedYears"
    :cache-meta="cacheMeta"
    :loaded-from-cache="loadedFromCache"
    :is-busy="status === 'checking' || status === 'downloading'"
    @select-year="(yr) => switchYear(yr)"
    @resync="(scope, count) => clearAndResync(scope, count)"
  />

  <main id="main-content" class="app-container" tabindex="-1">
    <InitLoader
      v-if="status !== 'ready' || !aggregated"
      :year="selectedYear"
      :status="status === 'ready' ? 'checking' : status"
      :progress="progress"
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
          <span v-if="cacheMeta?.dataExtracao">
            Última extração na base oficial: <strong>{{ cacheMeta.dataExtracao }}</strong>.
          </span>
        </p>
        <p>
          INF01006 — Projeto de Banco de Dados (UFRGS) • Front-end Vue 3 + TypeScript + Chart.js +
          D3.js + Web Workers + Cache Local por Ano (IndexedDB).
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
