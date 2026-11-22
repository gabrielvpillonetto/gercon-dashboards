<script setup lang="ts">
import { computed } from 'vue'
import { Activity, Calendar, Database, MapPin } from 'lucide-vue-next'
import { AVAILABLE_YEARS } from '../../../../packages/gercon-domain'
import type { DataScope, GerconYear } from '@/types/gercon'

const props = defineProps<{
  selectedYear: GerconYear
  selectedScope: DataScope
  dataExtracao: string | null
  isBusy: boolean
}>()

const emit = defineEmits<{
  'select-year': [year: GerconYear]
  'select-scope': [scope: DataScope]
}>()

const formattedExtractionDate = computed(() => {
  if (!props.dataExtracao) return null
  const [year, month, day] = props.dataExtracao.split('-')
  return `${day}/${month}/${year}`
})

function onYearChange(event: Event) {
  emit('select-year', Number((event.target as HTMLSelectElement).value) as GerconYear)
}

function onScopeChange(event: Event) {
  emit('select-scope', (event.target as HTMLSelectElement).value as DataScope)
}
</script>

<template>
  <header class="header" role="banner">
    <div class="header-inner">
      <div class="brand">
        <div class="brand-icon" aria-hidden="true">
          <Activity :size="20" />
        </div>
        <div class="brand-copy">
          <div class="brand-title-row">
            <h1 class="brand-title">GERCON Porto Alegre</h1>
            <span class="year-pill tabular-nums">{{ selectedYear }}</span>
          </div>
          <p class="brand-subtitle">
            Monitoramento analítico de filas de consultas especializadas • Dados Abertos SMS/POA
          </p>
        </div>
      </div>

      <div class="header-toolbar" aria-label="Seleção de ano e abrangência dos dados">
        <span
          class="badge badge-success"
          title="Indicadores calculados no banco (Supabase/PostgreSQL) sobre todas as solicitações do ano"
        >
          <Database :size="13" aria-hidden="true" />
          <span>Base completa</span>
          <template v-if="formattedExtractionDate">
            <span aria-hidden="true">•</span>
            <span class="tabular-nums">extração {{ formattedExtractionDate }}</span>
          </template>
        </span>

        <div class="toolbar-divider" aria-hidden="true" />

        <div class="year-picker scope-picker">
          <MapPin :size="14" class="year-icon" aria-hidden="true" />
          <label class="year-label" for="scope-select">Abrangência</label>
          <select
            id="scope-select"
            :value="selectedScope"
            class="year-select"
            :disabled="isBusy"
            @change="onScopeChange"
          >
            <option value="poa">Porto Alegre</option>
            <option value="rs">Todo RS / Regulação POA</option>
          </select>
        </div>

        <div class="year-picker">
          <Calendar :size="14" class="year-icon" aria-hidden="true" />
          <label class="year-label" for="year-select">Ano</label>
          <select
            id="year-select"
            :value="selectedYear"
            class="year-select tabular-nums"
            aria-label="Selecionar ano dos dados GERCON"
            :disabled="isBusy"
            @change="onYearChange"
          >
            <option v-for="yr in AVAILABLE_YEARS" :key="yr" :value="yr">{{ yr }}</option>
          </select>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header {
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 40;
  box-shadow: var(--shadow-xs);
}

.header-inner {
  max-width: 1440px;
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.brand-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #005b96 0%, #0072b2 100%);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 91, 150, 0.25);
}

.brand-copy {
  min-width: 0;
}

.brand-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.brand-title {
  margin: 0;
  font-size: 1.08rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text-primary);
  line-height: 1.2;
}

.year-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 700;
  background: var(--brand-soft);
  color: var(--brand-primary);
  border: 1px solid var(--brand-border);
}

.brand-subtitle {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.header-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.toolbar-divider {
  width: 1px;
  height: 22px;
  background: var(--border-color);
}

.year-picker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px 2px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--brand-border);
  background: var(--brand-soft);
  color: var(--brand-primary);
  transition: border-color var(--transition-fast), background-color var(--transition-fast);
}

.year-picker.scope-picker {
  background: var(--bg-surface);
  border-color: var(--border-color);
  color: var(--text-primary);
}

.scope-picker .year-select {
  color: var(--text-primary);
  font-weight: 600;
}

.year-picker:hover {
  border-color: var(--brand-primary);
}

.year-icon {
  flex-shrink: 0;
}

.year-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.year-select {
  border: none;
  background: transparent;
  color: var(--brand-primary);
  font-size: 0.82rem;
  font-weight: 700;
  padding: 4px 4px 4px 0;
  cursor: pointer;
}

@media (max-width: 768px) {
  .header-inner {
    padding: 10px 14px;
  }
  .brand-title {
    font-size: 0.98rem;
  }
  .toolbar-divider {
    display: none;
  }
}
</style>
