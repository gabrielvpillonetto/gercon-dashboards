<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Activity,
  Calendar,
  ChevronDown,
  Database,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-vue-next'
import { AVAILABLE_YEARS } from '@/services/ckanService'
import type { CacheMetadata, DataScope, GerconYear } from '@/types/gercon'

const props = defineProps<{
  selectedYear: GerconYear
  cachedYears: GerconYear[]
  cacheMeta: CacheMetadata | null
  loadedFromCache: boolean
  isBusy: boolean
}>()

const emit = defineEmits<{
  'select-year': [year: GerconYear]
  resync: [scope: DataScope, targetCount: number]
}>()

const selectedScope = ref<DataScope>(props.cacheMeta?.scope ?? 'poa')
const selectedCount = ref<number>(
  props.cacheMeta?.recordCount && props.cacheMeta.recordCount >= 40000 ? 50000 : 25000
)

const isConfigOpen = ref(false)
const configWrapperRef = ref<HTMLDivElement | null>(null)
const configTriggerRef = ref<HTMLButtonElement | null>(null)

watch(
  () => props.cacheMeta,
  (meta) => {
    if (meta) {
      selectedScope.value = meta.scope
    }
  }
)

const cachedSet = computed(() => new Set<GerconYear>(props.cachedYears))

const formattedSyncDate = computed(() => {
  if (!props.cacheMeta?.downloadedAt) return null
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(props.cacheMeta.downloadedAt))
  } catch {
    return props.cacheMeta.downloadedAt
  }
})

const scopeLabel = computed(() =>
  (props.cacheMeta?.scope ?? selectedScope.value) === 'poa' ? 'Porto Alegre' : 'Todo RS / Reg. POA'
)

function onYearChange(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value) as GerconYear
  emit('select-year', value)
}

function toggleConfig() {
  isConfigOpen.value = !isConfigOpen.value
}

function closeConfig(restoreFocus = false) {
  isConfigOpen.value = false
  if (restoreFocus) {
    configTriggerRef.value?.focus()
  }
}

function triggerResync() {
  isConfigOpen.value = false
  emit('resync', selectedScope.value, selectedCount.value)
}

function handleDocumentClick(event: MouseEvent) {
  if (!isConfigOpen.value) return
  const target = event.target as Node | null
  if (configWrapperRef.value && target && !configWrapperRef.value.contains(target)) {
    isConfigOpen.value = false
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isConfigOpen.value) {
    event.preventDefault()
    closeConfig(true)
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentClick)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
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

      <div class="header-toolbar" aria-label="Seleção de ano, status do cache e configuração da base">
        <div v-if="cacheMeta" class="cache-status" aria-live="polite">
          <span
            class="badge badge-success"
            :title="`Armazenado localmente no navegador (IndexedDB) • ${cachedYears.length} ano(s) em cache • Abrangência: ${scopeLabel}`"
          >
            <Database :size="13" aria-hidden="true" />
            <span class="tabular-nums">
              {{ cacheMeta.recordCount.toLocaleString('pt-BR') }} reg.
            </span>
            <span class="cache-sep" aria-hidden="true">•</span>
            <span>{{ loadedFromCache ? 'Cache local' : 'Sincronizado' }}</span>
          </span>
        </div>

        <div class="toolbar-divider" aria-hidden="true" />

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
            <option v-for="yr in AVAILABLE_YEARS" :key="yr" :value="yr">
              {{ yr }}{{ cachedSet.has(yr) ? ' ✓ em cache' : '' }}
            </option>
          </select>
        </div>

        <div ref="configWrapperRef" class="config-wrapper">
          <button
            ref="configTriggerRef"
            type="button"
            class="btn btn-sm config-trigger"
            :class="{ active: isConfigOpen }"
            :aria-expanded="isConfigOpen"
            aria-controls="base-config-panel"
            aria-haspopup="dialog"
            :disabled="isBusy"
            @click="toggleConfig"
          >
            <SlidersHorizontal :size="14" aria-hidden="true" />
            <span>Configurar base</span>
            <ChevronDown :size="14" class="chevron" :class="{ open: isConfigOpen }" aria-hidden="true" />
          </button>

          <div
            v-if="isConfigOpen"
            id="base-config-panel"
            class="config-popover"
            role="dialog"
            aria-label="Configurações da base local GERCON"
          >
            <div class="popover-head">
              <div>
                <h2 class="popover-title">Configurar base {{ selectedYear }}</h2>
                <p class="popover-sub">Abrangência, volume da amostra e ressincronização CKAN</p>
              </div>
              <button
                type="button"
                class="popover-close"
                aria-label="Fechar painel de configuração"
                @click="closeConfig(true)"
              >
                <X :size="16" aria-hidden="true" />
              </button>
            </div>

            <div class="popover-body">
              <div class="popover-field">
                <label for="scope-select">Abrangência geográfica</label>
                <select
                  id="scope-select"
                  v-model="selectedScope"
                  class="popover-select"
                  :disabled="isBusy"
                >
                  <option value="poa">Porto Alegre (município de residência)</option>
                  <option value="rs">Todo RS / Regulação Porto Alegre</option>
                </select>
              </div>

              <div class="popover-field">
                <label for="limit-select">Volume da amostra local (IndexedDB)</label>
                <select
                  id="limit-select"
                  v-model.number="selectedCount"
                  class="popover-select tabular-nums"
                  :disabled="isBusy"
                >
                  <option :value="15000">15.000 registros (mais rápido)</option>
                  <option :value="25000">25.000 registros (padrão equilibrado)</option>
                  <option :value="50000">50.000 registros (amostra ampla)</option>
                </select>
              </div>

              <div v-if="cacheMeta" class="popover-meta">
                <div class="meta-row">
                  <span>Última sincronização</span>
                  <strong class="tabular-nums">{{ formattedSyncDate ?? '—' }}</strong>
                </div>
                <div class="meta-row">
                  <span>Anos salvos no navegador</span>
                  <strong class="tabular-nums">{{ cachedYears.length }} de {{ AVAILABLE_YEARS.length }}</strong>
                </div>
              </div>
            </div>

            <div class="popover-footer">
              <button
                type="button"
                class="btn btn-primary btn-sm popover-submit"
                :disabled="isBusy"
                :aria-label="`Baixar novamente os dados de ${selectedYear} da API CKAN e atualizar o cache local`"
                @click="triggerResync"
              >
                <RefreshCw :size="14" :class="{ spin: isBusy }" aria-hidden="true" />
                <span>Atualizar base {{ selectedYear }}</span>
              </button>
            </div>
          </div>
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

.cache-status {
  display: flex;
  align-items: center;
}

.cache-sep {
  opacity: 0.55;
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

.config-wrapper {
  position: relative;
}

.config-trigger.active {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
  color: var(--brand-primary);
}

.chevron {
  transition: transform var(--transition-fast);
}

.chevron.open {
  transform: rotate(180deg);
}

.config-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  max-width: calc(100vw - 28px);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popover);
  z-index: 60;
  overflow: hidden;
}

.popover-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-inset);
}

.popover-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
}

.popover-sub {
  margin: 2px 0 0;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.popover-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.popover-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.popover-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.popover-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.popover-field label {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.popover-select {
  width: 100%;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 0.82rem;
}

.popover-meta {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.76rem;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-secondary);
}

.meta-row strong {
  color: var(--text-primary);
}

.popover-footer {
  padding: 12px 16px 14px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-inset);
}

.popover-submit {
  width: 100%;
  padding: 8px 12px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
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
  .config-popover {
    right: auto;
    left: 0;
  }
}
</style>
