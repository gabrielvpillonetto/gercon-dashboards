<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarRange, Check, ChevronDown, Filter, RotateCcw, Search, X, Zap } from 'lucide-vue-next'
import { ALL_STATUSES, STATUS_COLORS } from '@/constants/palette'
import type { DashboardFilters, FilterOptions, NormalizedStatus } from '@/types/gercon'

const props = defineProps<{
  filters: DashboardFilters
  options: FilterOptions
  computeTimeMs: number | null
  isComputing: boolean
}>()

const emit = defineEmits<{
  reset: []
}>()

// ---- Searchable Specialty Combobox ----
const specialtyQuery = ref(props.filters.especialidade)
const isSpecialtyOpen = ref(false)
const highlightedIndex = ref(0)
const comboboxRef = ref<HTMLDivElement | null>(null)
const specialtyInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.filters.especialidade,
  (val) => {
    specialtyQuery.value = val
  }
)

function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const filteredSpecialties = computed(() => {
  const q = normalizeSearch(specialtyQuery.value)
  if (!q || specialtyQuery.value === props.filters.especialidade) {
    return props.options.especialidades
  }
  return props.options.especialidades.filter((esp) => normalizeSearch(esp).includes(q))
})

// Combobox items: index 0 = "" ("Todas as especialidades"), 1..n = filteredSpecialties
const comboboxItems = computed(() => ['', ...filteredSpecialties.value])

function openSpecialtyMenu() {
  isSpecialtyOpen.value = true
  highlightedIndex.value = 0
}

function selectSpecialty(value: string) {
  props.filters.especialidade = value
  specialtyQuery.value = value
  isSpecialtyOpen.value = false
}

function clearSpecialty() {
  props.filters.especialidade = ''
  specialtyQuery.value = ''
  highlightedIndex.value = 0
  specialtyInputRef.value?.focus()
}

function onSpecialtyInput() {
  isSpecialtyOpen.value = true
  highlightedIndex.value = 0
  if (specialtyQuery.value.trim() === '') {
    props.filters.especialidade = ''
  }
}

function onSpecialtyKeydown(event: KeyboardEvent) {
  const count = comboboxItems.value.length
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (!isSpecialtyOpen.value) {
      openSpecialtyMenu()
    } else {
      highlightedIndex.value = (highlightedIndex.value + 1) % count
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (!isSpecialtyOpen.value) {
      openSpecialtyMenu()
    } else {
      highlightedIndex.value = (highlightedIndex.value - 1 + count) % count
    }
  } else if (event.key === 'Enter' && isSpecialtyOpen.value) {
    event.preventDefault()
    const chosen = comboboxItems.value[highlightedIndex.value]
    if (chosen !== undefined) {
      selectSpecialty(chosen)
    }
  } else if (event.key === 'Escape') {
    isSpecialtyOpen.value = false
    specialtyQuery.value = props.filters.especialidade
  }
}

function handleOutsideClick(event: MouseEvent) {
  if (!isSpecialtyOpen.value) return
  const target = event.target as Node | null
  if (comboboxRef.value && target && !comboboxRef.value.contains(target)) {
    isSpecialtyOpen.value = false
    specialtyQuery.value = props.filters.especialidade
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleOutsideClick)
})

// ---- Quick Period Presets ----
interface PeriodPreset {
  id: 'full' | 'h1' | 'h2' | 'q_last'
  label: string
  start: string
  end: string
  disabled: boolean
}

function clampDate(dateStr: string, min: string, max: string): string {
  if (dateStr < min) return min
  if (dateStr > max) return max
  return dateStr
}

function subtractDaysIso(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  dt.setUTCDate(dt.getUTCDate() - days)
  return dt.toISOString().slice(0, 10)
}

const periodPresets = computed<PeriodPreset[]>(() => {
  const min = props.options.minDate
  const max = props.options.maxDate
  const year = (max || min || '2025').slice(0, 4)

  const h1RawStart = `${year}-01-01`
  const h1RawEnd = `${year}-06-30`
  const h1Disabled = !min || !max || h1RawEnd < min || h1RawStart > max

  const h2RawStart = `${year}-07-01`
  const h2RawEnd = `${year}-12-31`
  const h2Disabled = !min || !max || h2RawEnd < min || h2RawStart > max

  const lastQuarterStart = max ? clampDate(subtractDaysIso(max, 89), min, max) : min

  return [
    {
      id: 'full',
      label: 'Ano inteiro',
      start: min,
      end: max,
      disabled: !min || !max,
    },
    {
      id: 'h1',
      label: '1º Semestre',
      start: h1Disabled ? min : clampDate(h1RawStart, min, max),
      end: h1Disabled ? max : clampDate(h1RawEnd, min, max),
      disabled: h1Disabled,
    },
    {
      id: 'h2',
      label: '2º Semestre',
      start: h2Disabled ? min : clampDate(h2RawStart, min, max),
      end: h2Disabled ? max : clampDate(h2RawEnd, min, max),
      disabled: h2Disabled,
    },
    {
      id: 'q_last',
      label: 'Último Trimestre',
      start: lastQuarterStart,
      end: max,
      disabled: !min || !max,
    },
  ]
})

function isPresetActive(preset: PeriodPreset): boolean {
  if (preset.disabled) return false
  return props.filters.dataInicio === preset.start && props.filters.dataFim === preset.end
}

function applyPeriodPreset(preset: PeriodPreset) {
  if (preset.disabled) return
  props.filters.dataInicio = preset.start
  props.filters.dataFim = preset.end
}

// ---- Active Filter Chips ----
function formatDateBr(iso: string): string {
  if (!iso || iso.length < 10) return iso
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

interface ActiveFilterChip {
  key: string
  category: string
  value: string
  remove: () => void
}

const activeFilterChips = computed<ActiveFilterChip[]>(() => {
  const chips: ActiveFilterChip[] = []

  if (props.filters.especialidade) {
    chips.push({
      key: 'especialidade',
      category: 'Especialidade',
      value: props.filters.especialidade,
      remove: () => {
        props.filters.especialidade = ''
        specialtyQuery.value = ''
      },
    })
  }

  if (props.filters.municipio) {
    chips.push({
      key: 'municipio',
      category: 'Município',
      value: props.filters.municipio,
      remove: () => {
        props.filters.municipio = ''
      },
    })
  }

  if (props.filters.classificacaoRisco) {
    chips.push({
      key: 'risco',
      category: 'Risco',
      value: props.filters.classificacaoRisco,
      remove: () => {
        props.filters.classificacaoRisco = ''
      },
    })
  }

  if (
    props.filters.dataInicio !== props.options.minDate ||
    props.filters.dataFim !== props.options.maxDate
  ) {
    chips.push({
      key: 'periodo',
      category: 'Período',
      value: `${formatDateBr(props.filters.dataInicio)} – ${formatDateBr(props.filters.dataFim)}`,
      remove: () => {
        props.filters.dataInicio = props.options.minDate
        props.filters.dataFim = props.options.maxDate
      },
    })
  }

  if (props.filters.statuses.length !== ALL_STATUSES.length) {
    chips.push({
      key: 'statuses',
      category: 'Status',
      value: props.filters.statuses.join(', '),
      remove: () => {
        props.filters.statuses = [...ALL_STATUSES]
      },
    })
  }

  return chips
})

const hasActiveFilters = computed(() => activeFilterChips.value.length > 0)

function toggleStatus(st: NormalizedStatus) {
  const idx = props.filters.statuses.indexOf(st)
  if (idx >= 0) {
    if (props.filters.statuses.length > 1) {
      props.filters.statuses.splice(idx, 1)
    }
  } else {
    props.filters.statuses.push(st)
  }
}

function isStatusSelected(st: NormalizedStatus): boolean {
  return props.filters.statuses.includes(st)
}
</script>

<template>
  <section class="card filter-card" aria-label="Filtros analíticos da fila GERCON">
    <div class="filter-top">
      <div class="filter-heading">
        <Filter :size="17" class="heading-icon" aria-hidden="true" />
        <h2>Filtros da Fila de Consultas</h2>
        <span v-if="activeFilterChips.length > 0" class="active-count tabular-nums">
          {{ activeFilterChips.length }} ativo{{ activeFilterChips.length > 1 ? 's' : '' }}
        </span>
      </div>

      <div class="filter-meta">
        <span
          v-if="computeTimeMs !== null"
          class="badge badge-brand tabular-nums"
          aria-live="polite"
          title="Tempo de agregação no Web Worker em segundo plano"
        >
          <Zap :size="13" aria-hidden="true" />
          <span>{{ isComputing ? 'Recalculando...' : `Atualizado em ${computeTimeMs} ms` }}</span>
        </span>

        <button
          type="button"
          class="btn btn-sm"
          :disabled="!hasActiveFilters"
          @click="emit('reset')"
        >
          <RotateCcw :size="14" aria-hidden="true" />
          <span>Limpar filtros</span>
        </button>
      </div>
    </div>

    <div class="filter-grid">
      <!-- Searchable Specialty Combobox -->
      <div ref="comboboxRef" class="field field-combobox">
        <label for="filter-especialidade">
          Especialidade Médica
          <span class="label-count tabular-nums">({{ options.especialidades.length }})</span>
        </label>
        <div class="combobox-wrap">
          <Search :size="14" class="combobox-search-icon" aria-hidden="true" />
          <input
            id="filter-especialidade"
            ref="specialtyInputRef"
            v-model="specialtyQuery"
            type="text"
            class="combobox-input"
            role="combobox"
            autocomplete="off"
            :aria-expanded="isSpecialtyOpen"
            aria-controls="specialty-listbox"
            aria-autocomplete="list"
            :aria-activedescendant="isSpecialtyOpen ? `esp-opt-${highlightedIndex}` : undefined"
            placeholder="Buscar entre todas as especialidades..."
            @focus="openSpecialtyMenu"
            @input="onSpecialtyInput"
            @keydown="onSpecialtyKeydown"
          />
          <button
            v-if="filters.especialidade || specialtyQuery"
            type="button"
            class="combobox-clear"
            aria-label="Limpar especialidade selecionada"
            @click="clearSpecialty"
          >
            <X :size="13" aria-hidden="true" />
          </button>
          <button
            v-else
            type="button"
            class="combobox-chevron"
            tabindex="-1"
            aria-label="Abrir lista de especialidades"
            @click="isSpecialtyOpen = !isSpecialtyOpen"
          >
            <ChevronDown :size="14" aria-hidden="true" />
          </button>
        </div>

        <ul
          v-if="isSpecialtyOpen"
          id="specialty-listbox"
          class="combobox-menu"
          role="listbox"
          aria-label="Especialidades médicas disponíveis"
        >
          <li
            id="esp-opt-0"
            role="option"
            class="combobox-option"
            :class="{
              highlighted: highlightedIndex === 0,
              selected: filters.especialidade === '',
            }"
            :aria-selected="filters.especialidade === ''"
            @mousedown.prevent="selectSpecialty('')"
            @mouseenter="highlightedIndex = 0"
          >
            <span>Todas as especialidades ({{ options.especialidades.length }})</span>
            <Check v-if="filters.especialidade === ''" :size="14" aria-hidden="true" />
          </li>

          <li
            v-for="(esp, idx) in filteredSpecialties"
            :id="`esp-opt-${idx + 1}`"
            :key="esp"
            role="option"
            class="combobox-option"
            :class="{
              highlighted: highlightedIndex === idx + 1,
              selected: filters.especialidade === esp,
            }"
            :aria-selected="filters.especialidade === esp"
            @mousedown.prevent="selectSpecialty(esp)"
            @mouseenter="highlightedIndex = idx + 1"
          >
            <span class="option-text">{{ esp }}</span>
            <Check v-if="filters.especialidade === esp" :size="14" aria-hidden="true" />
          </li>

          <li v-if="filteredSpecialties.length === 0" class="combobox-empty" role="status">
            Nenhuma especialidade encontrada para "{{ specialtyQuery }}".
          </li>
        </ul>
      </div>

      <div class="field">
        <label for="filter-municipio">
          Município do Paciente
          <span class="label-count tabular-nums">({{ options.municipios.length }})</span>
        </label>
        <select
          id="filter-municipio"
          v-model="filters.municipio"
          aria-label="Filtrar por município de residência do paciente"
        >
          <option value="">Todos os municípios ({{ options.municipios.length }})</option>
          <option v-for="mun in options.municipios" :key="mun" :value="mun">
            {{ mun }}
          </option>
        </select>
      </div>

      <div class="field">
        <label for="filter-risco">Classificação de Risco</label>
        <select
          id="filter-risco"
          v-model="filters.classificacaoRisco"
          aria-label="Filtrar por nível de prioridade na triagem"
        >
          <option value="">Todas as prioridades</option>
          <option v-for="risk in options.classificacoesRisco" :key="risk" :value="risk">
            {{ risk }}
          </option>
        </select>
      </div>

      <div class="field field-dates">
        <div class="date-col">
          <label for="filter-data-inicio">Solicitação (Início)</label>
          <input
            id="filter-data-inicio"
            v-model="filters.dataInicio"
            type="date"
            class="tabular-nums"
            :min="options.minDate"
            :max="filters.dataFim || options.maxDate"
            aria-label="Data inicial de solicitação"
          />
        </div>
        <div class="date-col">
          <label for="filter-data-fim">Solicitação (Fim)</label>
          <input
            id="filter-data-fim"
            v-model="filters.dataFim"
            type="date"
            class="tabular-nums"
            :min="filters.dataInicio || options.minDate"
            :max="options.maxDate"
            aria-label="Data final de solicitação"
          />
        </div>
      </div>
    </div>

    <div class="secondary-controls">
      <!-- Status Toggles -->
      <div class="control-group" role="group" aria-label="Filtrar por status na fila">
        <span class="group-label">Status na fila:</span>
        <div class="status-chips">
          <button
            v-for="st in ALL_STATUSES"
            :key="st"
            type="button"
            class="status-chip"
            :class="{ active: isStatusSelected(st) }"
            :aria-pressed="isStatusSelected(st)"
            @click="toggleStatus(st)"
          >
            <span
              class="dot"
              :style="{ backgroundColor: STATUS_COLORS[st] }"
              aria-hidden="true"
            />
            <span>{{ st }}</span>
          </button>
        </div>
      </div>

      <!-- Quick Period Presets -->
      <div class="control-group" role="group" aria-label="Atalhos rápidos de período">
        <span class="group-label">
          <CalendarRange :size="13" aria-hidden="true" />
          <span>Período rápido:</span>
        </span>
        <div class="segmented-control">
          <button
            v-for="preset in periodPresets"
            :key="preset.id"
            type="button"
            class="segmented-btn"
            :class="{ active: isPresetActive(preset) }"
            :aria-pressed="isPresetActive(preset)"
            :disabled="preset.disabled"
            @click="applyPeriodPreset(preset)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Active Filter Summary Chips -->
    <div
      v-if="activeFilterChips.length > 0"
      class="active-filters-bar"
      aria-label="Resumo de filtros ativos"
      aria-live="polite"
    >
      <span class="active-filters-label">Filtros aplicados:</span>
      <div class="active-chips-list">
        <span v-for="chip in activeFilterChips" :key="chip.key" class="active-chip">
          <span class="chip-cat">{{ chip.category }}:</span>
          <span class="chip-val tabular-nums">{{ chip.value }}</span>
          <button
            type="button"
            class="chip-remove"
            :aria-label="`Remover filtro ${chip.category}: ${chip.value}`"
            @click="chip.remove()"
          >
            <X :size="12" aria-hidden="true" />
          </button>
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.filter-card {
  padding: 16px 20px;
}

.filter-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.filter-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}

.heading-icon {
  color: var(--brand-primary);
}

.filter-heading h2 {
  margin: 0;
  font-size: 0.96rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.active-count {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  background: var(--brand-soft);
  color: var(--brand-primary);
  border: 1px solid var(--brand-border);
}

.filter-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.filter-grid {
  display: grid;
  grid-template-columns: 1.25fr 1fr 1fr 1.2fr;
  gap: 12px;
}

@media (max-width: 1120px) {
  .filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .filter-grid {
    grid-template-columns: 1fr;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.field label {
  font-size: 0.77rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.label-count {
  font-weight: 500;
  color: var(--text-muted);
}

.field select,
.field input[type='date'] {
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 0.84rem;
  transition: border-color var(--transition-fast);
}

.field select:hover,
.field input[type='date']:hover {
  border-color: var(--border-strong);
}

/* Searchable Specialty Combobox */
.field-combobox {
  position: relative;
}

.combobox-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.combobox-search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-muted);
  pointer-events: none;
}

.combobox-input {
  width: 100%;
  padding: 8px 32px 8px 30px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 0.84rem;
  transition: border-color var(--transition-fast);
}

.combobox-input:hover {
  border-color: var(--border-strong);
}

.combobox-clear,
.combobox-chevron {
  position: absolute;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.combobox-clear:hover,
.combobox-chevron:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.combobox-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 260px;
  overflow-y: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-popover);
  z-index: 50;
}

.combobox-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 4px;
  font-size: 0.82rem;
  color: var(--text-primary);
  cursor: pointer;
}

.combobox-option.highlighted {
  background: var(--bg-subtle);
}

.combobox-option.selected {
  background: var(--brand-soft);
  color: var(--brand-primary);
  font-weight: 600;
}

.option-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combobox-empty {
  padding: 10px 12px;
  font-size: 0.8rem;
  color: var(--text-muted);
  text-align: center;
}

.field-dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.date-col {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.secondary-controls {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 18px;
}

.control-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.group-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.status-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 0.79rem;
  font-weight: 600;
  cursor: pointer;
  opacity: 0.52;
  transition: opacity var(--transition-fast), border-color var(--transition-fast),
    background-color var(--transition-fast);
}

.status-chip:hover {
  opacity: 0.85;
}

.status-chip.active {
  opacity: 1;
  border-color: var(--border-strong);
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Active filter summary chips */
.active-filters-bar {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.active-filters-label {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-muted);
}

.active-chips-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.active-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px 3px 10px;
  border-radius: 999px;
  background: var(--brand-soft);
  border: 1px solid var(--brand-border);
  font-size: 0.76rem;
  color: var(--text-primary);
}

.chip-cat {
  color: var(--text-secondary);
  font-weight: 500;
}

.chip-val {
  font-weight: 700;
  color: var(--brand-primary);
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 91, 150, 0.12);
  color: var(--brand-primary);
  cursor: pointer;
  padding: 0;
  transition: background-color var(--transition-fast);
}

.chip-remove:hover {
  background: var(--brand-primary);
  color: #ffffff;
}
</style>
