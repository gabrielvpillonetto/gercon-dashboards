<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Clock4, Info } from 'lucide-vue-next'
import AccessibleDataTable from './AccessibleDataTable.vue'
import { HISTOGRAM_COLORS } from '@/constants/palette'
import type { WaitTimeHistogramData, WaitTimeScope } from '@/types/gercon'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

const props = defineProps<{
  data: WaitTimeHistogramData
  scope: WaitTimeScope
}>()

const emit = defineEmits<{
  'update:scope': [value: WaitTimeScope]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart<'bar'> | null = null

const waitTimeInsight = computed(() => {
  const { median, mean, p90, sampleCount } = props.data
  if (sampleCount === 0 || median === null || mean === null || p90 === null) return null

  const diff = mean - median
  if (mean > median * 1.2 && diff >= 5) {
    return {
      skewed: true,
      text: `Assimetria de cauda longa: a média (${mean}d) está ${diff} dias acima da mediana (${median}d), puxada por esperas prolongadas — 10% dos pacientes aguardam ${p90} dias ou mais (P90).`,
    }
  }
  return {
    skewed: false,
    text: `Distribuição relativamente concentrada: metade dos pacientes aguarda até ${median} dias (mediana), próxima à média de ${mean} dias, com P90 em ${p90} dias.`,
  }
})

const ariaSummary = computed(() => {
  if (props.data.sampleCount === 0) {
    return 'Histograma de tempo de espera sem registros válidos para o recorte atual.'
  }
  return `Histograma de distribuição de tempo de espera com ${props.data.sampleCount.toLocaleString('pt-BR')} consultas. Mediana de ${props.data.median} dias, percentil 90 de ${props.data.p90} dias e máximo de ${props.data.max} dias.`
})

const tableHeaders = ['Intervalo de Espera', 'Pacientes', 'Participação (%)']
const tableRows = computed(() =>
  props.data.buckets.map((b) => [
    b.label,
    b.count.toLocaleString('pt-BR'),
    `${b.percentage.toFixed(1).replace('.', ',')}%`,
  ])
)

function renderChart() {
  if (!canvasRef.value) return
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
  if (props.data.sampleCount === 0) return

  chartInstance = new Chart(canvasRef.value, {
    type: 'bar',
    data: {
      labels: props.data.buckets.map((b) => b.shortLabel),
      datasets: [
        {
          label: 'Pacientes',
          data: props.data.buckets.map((b) => b.count),
          backgroundColor: HISTOGRAM_COLORS,
          borderRadius: 6,
          barPercentage: 0.9,
          categoryPercentage: 0.88,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 220 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 31, 51, 0.94)',
          padding: 10,
          cornerRadius: 8,
          titleFont: { size: 12, weight: 700 },
          bodyFont: { size: 12 },
          callbacks: {
            title: (items) => {
              const idx = items[0]?.dataIndex ?? 0
              return props.data.buckets[idx]?.label ?? ''
            },
            label: (ctx) => {
              const bucket = props.data.buckets[ctx.dataIndex]
              if (!bucket) return ''
              return ` ${bucket.count.toLocaleString('pt-BR')} pacientes (${bucket.percentage.toFixed(1).replace('.', ',')}%)`
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#0f1f33',
            font: { size: 11.5, weight: 600 },
          },
          title: {
            display: true,
            text: 'Intervalo de Tempo de Espera (dias)',
            color: '#3b4f66',
            font: { size: 11.5, weight: 600 },
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
            text: 'Quantidade de Pacientes',
            color: '#3b4f66',
            font: { size: 11.5, weight: 600 },
          },
        },
      },
    },
  })
}

onMounted(renderChart)
watch([() => props.data, () => props.scope], renderChart, { deep: true })
onBeforeUnmount(() => chartInstance?.destroy())
</script>

<template>
  <article class="card" aria-labelledby="histogram-title">
    <div class="card-header">
      <div>
        <h3 id="histogram-title" class="card-title">
          <Clock4 :size="18" aria-hidden="true" />
          <span>Histograma de Tempo de Espera</span>
        </h3>
        <p class="card-subtitle">
          Distribuição real em intervalos de dias para avaliar extremos da fila além da média
        </p>
      </div>

      <div class="segmented-control" role="group" aria-label="Base de cálculo do tempo de espera">
        <button
          type="button"
          class="segmented-btn"
          :class="{ active: scope === 'atendidas' }"
          :aria-pressed="scope === 'atendidas'"
          @click="emit('update:scope', 'atendidas')"
        >
          Consultas Atendidas
        </button>
        <button
          type="button"
          class="segmented-btn"
          :class="{ active: scope === 'todas' }"
          :aria-pressed="scope === 'todas'"
          @click="emit('update:scope', 'todas')"
        >
          Todas com Espera
        </button>
      </div>
    </div>

    <div v-if="data.sampleCount === 0" class="empty-state">
      Nenhum registro com tempo de espera disponível para os filtros atuais.
    </div>

    <template v-else>
      <div class="stats-strip tabular-nums" aria-label="Estatísticas de distribuição do tempo de espera">
        <div class="stat-pill stat-pill--primary">
          <span class="stat-k">Mediana (P50)</span>
          <strong class="stat-v">{{ data.median }}d</strong>
        </div>
        <div class="stat-pill">
          <span class="stat-k">Média</span>
          <strong class="stat-v">{{ data.mean }}d</strong>
        </div>
        <div class="stat-pill stat-pill--primary">
          <span class="stat-k">P90</span>
          <strong class="stat-v">{{ data.p90 }}d</strong>
        </div>
        <div class="stat-pill">
          <span class="stat-k">P95</span>
          <strong class="stat-v">{{ data.p95 }}d</strong>
        </div>
        <div class="stat-pill">
          <span class="stat-k">Máximo</span>
          <strong class="stat-v">{{ data.max }}d</strong>
        </div>
        <div class="stat-pill">
          <span class="stat-k">Amostra</span>
          <strong class="stat-v">{{ data.sampleCount.toLocaleString('pt-BR') }}</strong>
        </div>
      </div>

      <div v-if="waitTimeInsight" class="insight-banner tabular-nums">
        <Info :size="15" aria-hidden="true" />
        <span>
          <strong>Leitura clínica:</strong> {{ waitTimeInsight.text }}
        </span>
      </div>

      <div class="chart-canvas-wrap">
        <canvas ref="canvasRef" role="img" :aria-label="ariaSummary" />
      </div>

      <AccessibleDataTable
        caption="Distribuição de pacientes por intervalo de tempo de espera em dias"
        filename="gercon-histograma-tempo-espera.csv"
        :headers="tableHeaders"
        :rows="tableRows"
      />
    </template>
  </article>
</template>

<style scoped>
.stats-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}

@media (max-width: 720px) {
  .stats-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.stat-pill {
  background: var(--bg-inset);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 9px 10px;
  text-align: center;
}

.stat-pill--primary {
  background: var(--brand-soft);
  border-color: var(--brand-border);
}

.stat-pill--primary .stat-k {
  color: var(--brand-primary);
}

.stat-pill--primary .stat-v {
  color: var(--brand-primary);
}

.stat-k {
  display: block;
  font-size: 0.71rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.stat-v {
  display: block;
  margin-top: 2px;
  font-size: 1.04rem;
  font-weight: 700;
  color: var(--text-primary);
}
</style>
