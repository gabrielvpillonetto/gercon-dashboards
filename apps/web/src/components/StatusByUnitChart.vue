<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { BarChart3, Info } from 'lucide-vue-next'
import AccessibleDataTable from './AccessibleDataTable.vue'
import { ALL_STATUSES, STATUS_COLORS } from '@/constants/palette'
import type { StatusByUnitRow } from '@/types/gercon'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const props = defineProps<{
  rows: StatusByUnitRow[]
  topLimit: number
}>()

const emit = defineEmits<{
  'update:topLimit': [limit: number]
}>()

const mode = ref<'absolute' | 'percent'>('absolute')
const canvasRef = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart<'bar'> | null = null

function truncateLabel(label: string, maxLen = 34): string {
  return label.length > maxLen ? `${label.slice(0, maxLen - 1)}…` : label
}

const bottleneckInsight = computed(() => {
  if (props.rows.length === 0) return null
  const highestPending = [...props.rows].sort((a, b) => b.counts.Aguardando - a.counts.Aguardando)[0]
  if (!highestPending || highestPending.counts.Aguardando === 0) {
    const top = props.rows[0]
    return {
      unit: top.unit,
      pending: 0,
      total: top.total,
      pctPending: 0,
    }
  }
  const pct = highestPending.total > 0 ? (highestPending.counts.Aguardando / highestPending.total) * 100 : 0
  return {
    unit: highestPending.unit,
    pending: highestPending.counts.Aguardando,
    total: highestPending.total,
    pctPending: pct,
  }
})

const ariaSummary = computed(() => {
  if (props.rows.length === 0) {
    return 'Gráfico de barras empilhadas sem dados para os filtros selecionados.'
  }
  const top = props.rows[0]
  return `Gráfico de barras empilhadas mostrando a proporção de status em ${props.rows.length} unidades prestadoras. Maior volume: ${top.unit} com ${top.total.toLocaleString('pt-BR')} consultas.`
})

const tableHeaders = ['Unidade Prestadora', ...ALL_STATUSES, 'Total']
const tableRows = computed(() =>
  props.rows.map((r) => [
    r.unit,
    ...ALL_STATUSES.map((st) =>
      mode.value === 'percent' && r.total > 0
        ? `${((r.counts[st] / r.total) * 100).toFixed(1)}%`
        : r.counts[st].toLocaleString('pt-BR')
    ),
    r.total.toLocaleString('pt-BR'),
  ])
)

function renderChart() {
  if (!canvasRef.value) return
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
  if (props.rows.length === 0) return

  const isPercent = mode.value === 'percent'

  const datasets = ALL_STATUSES.map((st) => ({
    label: st,
    data: props.rows.map((r) => {
      if (isPercent) {
        return r.total > 0 ? Number(((r.counts[st] / r.total) * 100).toFixed(1)) : 0
      }
      return r.counts[st]
    }),
    backgroundColor: STATUS_COLORS[st],
    borderRadius: 2,
    borderSkipped: false as const,
  }))

  chartInstance = new Chart(canvasRef.value, {
    type: 'bar',
    data: {
      labels: props.rows.map((r) => truncateLabel(r.unit)),
      datasets,
    },
    options: {
      indexAxis: 'y',
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
            title: (items) => {
              const idx = items[0]?.dataIndex ?? 0
              return props.rows[idx]?.unit ?? ''
            },
            label: (ctx) => {
              const val = Number(ctx.raw ?? 0)
              return isPercent
                ? ` ${ctx.dataset.label}: ${val.toFixed(1).replace('.', ',')}%`
                : ` ${ctx.dataset.label}: ${val.toLocaleString('pt-BR')}`
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          max: isPercent ? 100 : undefined,
          grid: { color: '#e8eef5' },
          border: { display: false },
          ticks: {
            color: '#3b4f66',
            font: { size: 11 },
            callback: (value) =>
              isPercent ? `${value}%` : Number(value).toLocaleString('pt-BR'),
          },
          title: {
            display: true,
            text: isPercent ? 'Proporção (%)' : 'Quantidade de Consultas',
            color: '#3b4f66',
            font: { size: 11.5, weight: 600 },
          },
        },
        y: {
          stacked: true,
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#0f1f33',
            font: { size: 11, weight: 500 },
          },
        },
      },
    },
  })
}

onMounted(renderChart)
watch([() => props.rows, mode], renderChart, { deep: true })
onBeforeUnmount(() => chartInstance?.destroy())
</script>

<template>
  <article class="card" aria-labelledby="status-unit-title">
    <div class="card-header">
      <div>
        <h3 id="status-unit-title" class="card-title">
          <BarChart3 :size="18" aria-hidden="true" />
          <span>Proporção de Status por Unidade Prestadora</span>
        </h3>
        <p class="card-subtitle">
          Identificação de gargalos sistêmicos acumulando consultas por status em cada unidade
        </p>
      </div>

      <div class="controls-row">
        <div class="segmented-control" role="group" aria-label="Modo de exibição de barras">
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: mode === 'absolute' }"
            :aria-pressed="mode === 'absolute'"
            @click="mode = 'absolute'"
          >
            Absoluto
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: mode === 'percent' }"
            :aria-pressed="mode === 'percent'"
            @click="mode = 'percent'"
          >
            Proporção (%)
          </button>
        </div>

        <div class="segmented-control" role="group" aria-label="Quantidade de unidades exibidas">
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: topLimit === 10 }"
            :aria-pressed="topLimit === 10"
            @click="emit('update:topLimit', 10)"
          >
            Top 10
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: topLimit === 15 }"
            :aria-pressed="topLimit === 15"
            @click="emit('update:topLimit', 15)"
          >
            Top 15
          </button>
        </div>
      </div>
    </div>

    <div v-if="rows.length === 0" class="empty-state">
      Nenhuma unidade encontrada para os filtros selecionados.
    </div>

    <template v-else>
      <div v-if="bottleneckInsight" class="insight-banner tabular-nums">
        <Info :size="15" aria-hidden="true" />
        <span v-if="bottleneckInsight.pending > 0">
          Maior fila em espera no Top {{ topLimit }}: <strong>{{ bottleneckInsight.unit }}</strong>
          com <strong>{{ bottleneckInsight.pending.toLocaleString('pt-BR') }}</strong> consultas aguardando
          ({{ bottleneckInsight.pctPending.toFixed(1).replace('.', ',') }}% do volume da unidade).
        </span>
        <span v-else>
          Maior volume no recorte: <strong>{{ bottleneckInsight.unit }}</strong>
          com <strong>{{ bottleneckInsight.total.toLocaleString('pt-BR') }}</strong> consultas registradas.
        </span>
      </div>

      <div class="chart-canvas-wrap chart-canvas-wrap--tall">
        <canvas ref="canvasRef" role="img" :aria-label="ariaSummary" />
      </div>

      <AccessibleDataTable
        caption="Distribuição de consultas por status e unidade prestadora"
        filename="gercon-status-por-unidade.csv"
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
