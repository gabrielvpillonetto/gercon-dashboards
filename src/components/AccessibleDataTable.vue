<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { Check, ChevronDown, ChevronUp, Download, Table2 } from 'lucide-vue-next'

const props = defineProps<{
  caption: string
  headers: string[]
  rows: Array<Array<string | number>>
  filename?: string
}>()

const expanded = ref(false)
const justExported = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | null = null

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '')
  if (/[",\r\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildFilename(): string {
  if (props.filename) {
    return props.filename.endsWith('.csv') ? props.filename : `${props.filename}.csv`
  }
  const slug = props.caption
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'gercon-dados'}.csv`
}

function exportCsv() {
  const headerLine = props.headers.map(escapeCsvCell).join(',')
  const bodyLines = props.rows.map((row) => row.map(escapeCsvCell).join(','))
  const csvContent = `\uFEFF${[headerLine, ...bodyLines].join('\r\n')}`

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = buildFilename()
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  justExported.value = true
  if (resetTimer) clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    justExported.value = false
  }, 2000)
}

onBeforeUnmount(() => {
  if (resetTimer) clearTimeout(resetTimer)
})
</script>

<template>
  <div class="a11y-table-wrap">
    <div class="a11y-actions">
      <button
        type="button"
        class="a11y-toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <Table2 :size="15" aria-hidden="true" />
        <span>{{ expanded ? 'Ocultar tabela acessível' : 'Ver dados em tabela acessível (VoiceOver)' }}</span>
        <ChevronUp v-if="expanded" :size="15" aria-hidden="true" />
        <ChevronDown v-else :size="15" aria-hidden="true" />
      </button>

      <button
        type="button"
        class="btn btn-sm csv-btn"
        :class="{ 'csv-btn--done': justExported }"
        :disabled="rows.length === 0"
        :aria-label="`Exportar ${caption} em formato CSV (UTF-8)`"
        @click="exportCsv"
      >
        <Check v-if="justExported" :size="14" aria-hidden="true" />
        <Download v-else :size="14" aria-hidden="true" />
        <span>{{ justExported ? 'CSV exportado' : 'Exportar CSV' }}</span>
      </button>
    </div>

    <span class="sr-only" aria-live="polite">
      {{ justExported ? `Arquivo CSV de ${caption} exportado com sucesso.` : '' }}
    </span>

    <div :class="expanded ? 'table-scroll' : 'sr-only'">
      <table class="data-table tabular-nums">
        <caption>{{ caption }}</caption>
        <thead>
          <tr>
            <th v-for="(header, idx) in headers" :key="idx" scope="col">
              {{ header }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rIdx) in rows" :key="rIdx">
            <td v-for="(cell, cIdx) in row" :key="cIdx">
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.a11y-table-wrap {
  margin-top: 14px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 10px;
}

.a11y-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.a11y-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--brand-primary);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  padding: 5px 6px;
  transition: background-color var(--transition-fast);
}

.a11y-toggle:hover {
  background: var(--brand-soft);
}

.csv-btn {
  padding: 4px 10px;
  font-size: 0.77rem;
  color: var(--text-secondary);
}

.csv-btn--done {
  background: var(--success-bg);
  border-color: var(--success-border);
  color: var(--success);
}

.table-scroll {
  margin-top: 10px;
  overflow-x: auto;
  max-height: 260px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.81rem;
}

.data-table caption {
  text-align: left;
  padding: 8px 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-inset);
  border-bottom: 1px solid var(--border-subtle);
}

.data-table th,
.data-table td {
  padding: 7px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.data-table tbody tr:hover {
  background: var(--bg-inset);
}

.data-table thead th {
  position: sticky;
  top: 0;
  background: var(--bg-surface);
  font-weight: 700;
  color: var(--text-primary);
  box-shadow: 0 1px 0 var(--border-color);
}
</style>
