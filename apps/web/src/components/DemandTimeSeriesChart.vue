<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Info, TrendingUp } from 'lucide-vue-next'
import AccessibleDataTable from './AccessibleDataTable.vue'
import { SERIES_COLORS } from '@/constants/palette'
import type { TimeGranularity, TimeSeriesData } from '@/types/gercon'

Chart.register(
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler
)

const props = defineProps<{
  data: TimeSeriesData
  granularity: TimeGranularity
}>()

const emit = defineEmits<{
  'update:granularity': [value: TimeGranularity]
}>()

const viewMode = ref<'specialties' | 'total'>('specialties')
const canvasRef = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart<'line'> | null = null

const peakInsight = computed(() => {
  if (props.data.labels.length === 0 || props.data.totalSeries.length === 0) return null
  let peakIdx = 0
  let peakVal = props.data.totalSeries[0] ?? 0
  let sum = 0
  for (let i = 0; i < props.data.totalSeries.length; i++) {
    const val = props.data.totalSeries[i] ?? 0
    sum += val
    if (val > peakVal) {
      peakVal = val
      peakIdx = i
    }
  }
  const avg = Math.round(sum / props.data.totalSeries.length)
  return {
    label: props.data.labels[peakIdx] ?? '',
    value: peakVal,
    average: avg,
  }
})

const ariaSummary = computed(() => {
  if (props.data.labels.length === 0) {
    return 'Gráfico de série temporal sem dados para o período selecionado.'
  }
  const periodLabel = props.granularity === 'weekly' ? 'semanal' : 'mensal'
  return `Gráfico de linha de tendência de demanda ${periodLabel} com ${props.data.labels.length} períodos, exibindo ${viewMode.value === 'total' ? 'o total geral de solicitações' : 'as 5 especialidades de maior demanda'}.`
})

const tableHeaders = computed(() => {
  if (viewMode.value === 'total') {
    return ['Período', 'Total de Solicitações']
  }
  return ['Período', ...props.data.topSpecialties.map((s) => s.label), 'Total Geral']
})

const tableRows = computed(() =>
  props.data.labels.map((label, idx) => {
    if (viewMode.value === 'total') {
      return [label, (props.data.totalSeries[idx] ?? 0).toLocaleString('pt-BR')]
    }
    return [
      label,
      ...props.data.topSpecialties.map((s) => (s.values[idx] ?? 0).toLocaleString('pt-BR')),
      (props.data.totalSeries[idx] ?? 0).toLocaleString('pt-BR'),
    ]
  })
)

function renderChart() {
  if (!canvasRef.value) return
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
  if (props.data.labels.length === 0) return

  const datasets =
    viewMode.value === 'total'
      ? [
          {
            label: 'Total de Solicitações',
            data: props.data.totalSeries,
            borderColor: SERIES_COLORS[0],
            backgroundColor: 'rgba(0, 114, 178, 0.12)',
            fill: true,
            tension: 0.28,
            borderWidth: 2.5,
            pointRadius: props.granularity === 'weekly' ? 2.5 : 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#ffffff',
            pointBorderWidth: 2,
          },
        ]
      : props.data.topSpecialties.map((s, idx) => ({
          label: s.label.length > 32 ? `${s.label.slice(0, 31)}…` : s.label,
          data: s.values,
          borderColor: SERIES_COLORS[idx % SERIES_COLORS.length],
          backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length],
          fill: false,
          tension: 0.25,
          borderWidth: 2.2,
          pointRadius: props.granularity === 'weekly' ? 2 : 3.5,
          pointHoverRadius: 5.5,
        }))

  chartInstance = new Chart(canvasRef.value, {
    type: 'line',
    data: {
      labels: props.data.labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 220 },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
            padding: 14,
            color: '#0f1f33',
            font: { size: 11.5, weight: 600 },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 31, 51, 0.94)',
          padding: 10,
          cornerRadius: 8,
          titleFont: { size: 12, weight: 700 },
          bodyFont: { size: 12 },
          callbacks: {
            label: (ctx) =>
              ` ${ctx.dataset.label}: ${Number(ctx.raw ?? 0).toLocaleString('pt-BR')} solicitações`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: '#eef3f8' },
          border: { display: false },
          ticks: {
            color: '#3b4f66',
            font: { size: 11 },
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 12,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#e8eef5' },
          border: { display: false },
          ticks: {
            color: '#3b4f66',
            font: { size: 11 },
            callback: (v) => Number(v).toLocaleString('pt-BR'),
          },
          title: {
            display: true,
            text: 'Solicitações de Consulta',
            color: '#3b4f66',
            font: { size: 11.5, weight: 600 },
          },
        },
      },
    },
  })
}

onMounted(renderChart)
watch([() => props.data, () => props.granularity, viewMode], renderChart, { deep: true })
onBeforeUnmount(() => chartInstance?.destroy())
</script>

<template>
  <article class="card" aria-labelledby="timeseries-title">
    <div class="card-header">
      <div>
        <h3 id="timeseries-title" class="card-title">
          <TrendingUp :size="18" aria-hidden="true" />
          <span>Tendências de Demanda Longitudinal</span>
        </h3>
        <p class="card-subtitle">
          Evolução semanal ou mensal das solicitações para identificar picos em especialidades
        </p>
      </div>

      <div class="controls-row">
        <div class="segmented-control" role="group" aria-label="Granularidade temporal">
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: granularity === 'monthly' }"
            :aria-pressed="granularity === 'monthly'"
            @click="emit('update:granularity', 'monthly')"
          >
            Mensal
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: granularity === 'weekly' }"
            :aria-pressed="granularity === 'weekly'"
            @click="emit('update:granularity', 'weekly')"
          >
            Semanal
          </button>
        </div>

        <div class="segmented-control" role="group" aria-label="Agrupamento da série">
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: viewMode === 'specialties' }"
            :aria-pressed="viewMode === 'specialties'"
            @click="viewMode = 'specialties'"
          >
            Top 5 Especialidades
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: viewMode === 'total' }"
            :aria-pressed="viewMode === 'total'"
            @click="viewMode = 'total'"
          >
            Total Geral
          </button>
        </div>
      </div>
    </div>

    <div v-if="data.labels.length === 0" class="empty-state">
      Sem solicitações no período selecionado.
    </div>

    <template v-else>
      <div v-if="peakInsight" class="insight-banner tabular-nums">
        <Info :size="15" aria-hidden="true" />
        <span>
          Pico de demanda {{ granularity === 'weekly' ? 'semanal' : 'mensal' }} em
          <strong>{{ peakInsight.label }}</strong> com
          <strong>{{ peakInsight.value.toLocaleString('pt-BR') }}</strong> solicitações
          (média de {{ peakInsight.average.toLocaleString('pt-BR') }} por período).
        </span>
      </div>

      <div class="chart-canvas-wrap chart-canvas-wrap--tall">
        <canvas ref="canvasRef" role="img" :aria-label="ariaSummary" />
      </div>

      <AccessibleDataTable
        caption="Série temporal de solicitações de consultas especializadas"
        filename="gercon-demanda-longitudinal.csv"
        :headers="tableHeaders"
        :rows="tableRows"
      />
    </template>
  </article>
</template>

<style scoped>
.controls-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
