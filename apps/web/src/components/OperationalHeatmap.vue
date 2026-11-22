<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import { Flame } from 'lucide-vue-next'
import AccessibleDataTable from './AccessibleDataTable.vue'
import type { HeatmapCell, HeatmapData, HeatmapDimension } from '@/types/gercon'

const props = defineProps<{
  data: HeatmapData
  dimension: HeatmapDimension
}>()

const emit = defineEmits<{
  'update:dimension': [dim: HeatmapDimension]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const hoveredCell = ref<HeatmapCell | null>(null)
let resizeObserver: ResizeObserver | null = null

const ariaSummary = computed(() => {
  if (props.data.rows.length === 0) {
    return 'Mapa de calor sem consultas aguardando contemplação no recorte atual.'
  }
  return `Mapa de calor D3.js de pressão operacional com ${props.data.totalPending.toLocaleString('pt-BR')} consultas aguardando contemplação, cruzando ${props.data.rows.length} unidades prestadoras por ${props.data.dimensionLabel}. Valor máximo em uma célula: ${props.data.maxValue.toLocaleString('pt-BR')}.`
})

const tableHeaders = computed(() => ['Unidade', ...props.data.cols])
const tableRows = computed(() => {
  const lookup = new Map<string, number>()
  for (const c of props.data.cells) {
    lookup.set(`${c.row}|||${c.col}`, c.value)
  }
  return props.data.rows.map((r) => [
    r,
    ...props.data.cols.map((c) => (lookup.get(`${r}|||${c}`) ?? 0).toLocaleString('pt-BR')),
  ])
})

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str
}

function renderHeatmap() {
  const container = containerRef.value
  if (!container) return

  d3.select(container).selectAll('*').remove()

  if (props.data.rows.length === 0 || props.data.cols.length === 0) {
    return
  }

  const containerWidth = Math.max(container.clientWidth || 680, 520)
  const margin = { top: 18, right: 24, bottom: 96, left: 220 }
  const rowHeight = 34
  const innerWidth = containerWidth - margin.left - margin.right
  const innerHeight = Math.max(props.data.rows.length * rowHeight, 160)
  const totalHeight = innerHeight + margin.top + margin.bottom

  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', containerWidth)
    .attr('height', totalHeight)
    .attr('role', 'img')
    .attr('aria-label', ariaSummary.value)

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  const x = d3.scaleBand<string>().domain(props.data.cols).range([0, innerWidth]).padding(0.06)
  const y = d3.scaleBand<string>().domain(props.data.rows).range([0, innerHeight]).padding(0.08)

  // Escala sequencial Cividis — perceptualmente uniforme e segura para todos os tipos de daltonismo
  const colorScale = d3
    .scaleSequential(d3.interpolateCividis)
    .domain([0, Math.max(props.data.maxValue, 1)])

  // Eixo X
  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickSize(0).tickFormat((d) => truncate(String(d), 20)))
    .call((sel) => sel.select('.domain').remove())
    .selectAll('text')
    .attr('transform', 'rotate(-28)')
    .style('text-anchor', 'end')
    .style('font-size', '11px')
    .style('font-weight', '500')
    .style('fill', '#3b4f66')
    .attr('dx', '-0.4em')
    .attr('dy', '0.5em')

  // Eixo Y
  g.append('g')
    .call(d3.axisLeft(y).tickSize(0).tickFormat((d) => truncate(String(d), 30)))
    .call((sel) => sel.select('.domain').remove())
    .selectAll('text')
    .style('font-size', '11px')
    .style('font-weight', '500')
    .style('fill', '#0f1f33')

  // Grupo dedicado às células para manter os rótulos sempre acima no z-order
  const cellsLayer = g.append('g').attr('class', 'cells-layer')
  const labelsLayer = g.append('g').attr('class', 'labels-layer')

  const cells = cellsLayer
    .selectAll<SVGRectElement, HeatmapCell>('rect.cell')
    .data(props.data.cells)
    .enter()
    .append('rect')
    .attr('class', 'cell')
    .attr('x', (d) => x(d.col) ?? 0)
    .attr('y', (d) => y(d.row) ?? 0)
    .attr('width', x.bandwidth())
    .attr('height', y.bandwidth())
    .attr('rx', 4)
    .attr('ry', 4)
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr(
      'aria-label',
      (d) =>
        `${d.row}, ${d.col}: ${d.value.toLocaleString('pt-BR')} consultas aguardando contemplação`
    )
    .style('fill', (d) => (d.value === 0 ? '#eef3f8' : colorScale(d.value)))
    .style('stroke', '#ffffff')
    .style('stroke-width', 1.5)
    .style('cursor', 'pointer')
    .style('outline', 'none')
    .on('mouseenter focus', function (_event, d) {
      hoveredCell.value = d
      d3.select(this)
        .raise()
        .style('stroke', '#0f1f33')
        .style('stroke-width', 2.5)
    })
    .on('mouseleave blur', function () {
      hoveredCell.value = null
      d3.select(this)
        .style('stroke', '#ffffff')
        .style('stroke-width', 1.5)
    })

  cells.append('title').text(
    (d) => `${d.row}\n${d.col}: ${d.value.toLocaleString('pt-BR')} aguardando`
  )

  // Rótulos numéricos dentro das células com contraste dinâmico
  labelsLayer
    .selectAll<SVGTextElement, HeatmapCell>('text.cell-label')
    .data(props.data.cells.filter((c) => c.value > 0))
    .enter()
    .append('text')
    .attr('class', 'cell-label')
    .attr('x', (d) => (x(d.col) ?? 0) + x.bandwidth() / 2)
    .attr('y', (d) => (y(d.row) ?? 0) + y.bandwidth() / 2 + 4)
    .attr('text-anchor', 'middle')
    .style('font-size', '11px')
    .style('font-weight', '700')
    .style('font-variant-numeric', 'tabular-nums')
    .style('pointer-events', 'none')
    .style('fill', (d) => {
      const ratio = d.value / Math.max(props.data.maxValue, 1)
      return ratio > 0.55 ? '#0f1f33' : '#ffffff'
    })
    .text((d) => d.value.toLocaleString('pt-BR'))
}

onMounted(() => {
  renderHeatmap()
  if (containerRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => renderHeatmap())
    resizeObserver.observe(containerRef.value)
  }
})

watch([() => props.data, () => props.dimension], renderHeatmap, { deep: true })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <article class="card" aria-labelledby="heatmap-title">
    <div class="card-header">
      <div>
        <h3 id="heatmap-title" class="card-title">
          <Flame :size="18" aria-hidden="true" />
          <span>Mapa de Calor — Pressão Operacional (Aguardando)</span>
        </h3>
        <p class="card-subtitle">
          Cruza unidades com o volume de consultas aguardando contemplação (escala D3 Cividis segura para daltônicos)
        </p>
      </div>

      <div class="segmented-control" role="group" aria-label="Dimensão das colunas do mapa de calor">
        <button
          type="button"
          class="segmented-btn"
          :class="{ active: dimension === 'especialidade' }"
          :aria-pressed="dimension === 'especialidade'"
          @click="emit('update:dimension', 'especialidade')"
        >
          Especialidade
        </button>
        <button
          type="button"
          class="segmented-btn"
          :class="{ active: dimension === 'risco' }"
          :aria-pressed="dimension === 'risco'"
          @click="emit('update:dimension', 'risco')"
        >
          Risco
        </button>
        <button
          type="button"
          class="segmented-btn"
          :class="{ active: dimension === 'mes' }"
          :aria-pressed="dimension === 'mes'"
          @click="emit('update:dimension', 'mes')"
        >
          Mês
        </button>
      </div>
    </div>

    <div v-if="data.rows.length === 0" class="empty-state">
      Nenhuma consulta com status "Aguardando" encontrada para os filtros selecionados.
    </div>

    <template v-else>
      <div class="heatmap-status-bar tabular-nums" aria-live="polite">
        <div v-if="hoveredCell" class="hover-readout">
          <strong>{{ hoveredCell.row }}</strong>
          <span class="sep" aria-hidden="true">•</span>
          <span>{{ hoveredCell.col }}</span>
          <span class="highlight-pill">
            {{ hoveredCell.value.toLocaleString('pt-BR') }} aguardando
          </span>
        </div>
        <div v-else class="hover-readout muted">
          Passe o cursor ou navegue via teclado sobre uma célula para detalhes (<strong>{{
            data.totalPending.toLocaleString('pt-BR')
          }}</strong>
          consultas aguardando no recorte).
        </div>

        <div class="legend" aria-hidden="true">
          <span class="legend-cap">Menor</span>
          <span>0</span>
          <div class="legend-gradient" />
          <span>{{ data.maxValue.toLocaleString('pt-BR') }}</span>
          <span class="legend-cap">Maior</span>
        </div>
      </div>

      <div class="heatmap-scroll">
        <div ref="containerRef" class="heatmap-container" />
      </div>

      <AccessibleDataTable
        :caption="`Mapa de calor de consultas aguardando por unidade e ${data.dimensionLabel}`"
        filename="gercon-mapa-calor-pressao.csv"
        :headers="tableHeaders"
        :rows="tableRows"
      />
    </template>
  </article>
</template>

<style scoped>
.heatmap-status-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  margin-bottom: 12px;
  font-size: 0.82rem;
}

.hover-readout {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
}

.hover-readout.muted {
  color: var(--text-secondary);
}

.sep {
  color: var(--text-muted);
}

.highlight-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--brand-soft);
  border: 1px solid var(--brand-border);
  color: var(--brand-primary);
  font-weight: 700;
  font-size: 0.78rem;
}

.legend {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.legend-cap {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.legend-gradient {
  width: 112px;
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, #00204d 0%, #575d6d 40%, #a69d75 72%, #ffea46 100%);
  border: 1px solid rgba(15, 31, 51, 0.16);
}

.heatmap-scroll {
  width: 100%;
  overflow-x: auto;
}

.heatmap-container {
  min-width: 520px;
  width: 100%;
}
</style>
