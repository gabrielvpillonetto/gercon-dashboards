<script setup lang="ts">
import { computed } from 'vue'
import {
  AlertTriangle,
  Check,
  CloudDownload,
  Cpu,
  Database,
  Loader2,
  RotateCcw,
} from 'lucide-vue-next'
import type { DownloadProgress, GerconYear } from '@/types/gercon'

const props = defineProps<{
  year: GerconYear
  status: 'checking' | 'downloading' | 'error'
  progress: DownloadProgress
  errorMessage: string | null
}>()

const emit = defineEmits<{
  retry: []
}>()

const percent = computed(() => {
  if (props.progress.target <= 0) return 0
  return Math.min(100, Math.round((props.progress.fetched / props.progress.target) * 100))
})

const activeStep = computed<1 | 2 | 3>(() => {
  const msg = props.progress.message.toLowerCase()
  if (msg.includes('web worker') || msg.includes('agregação')) {
    return 3
  }
  if (msg.includes('indexeddb') || msg.includes('salvando')) {
    return 2
  }
  if (props.status === 'checking') {
    return 2
  }
  return 1
})

interface StepItem {
  num: 1 | 2 | 3
  title: string
  subtitle: string
}

const steps: StepItem[] = [
  { num: 1, title: 'Baixar API CKAN', subtitle: 'Dados abertos SMS/POA' },
  { num: 2, title: 'Salvar no IndexedDB', subtitle: 'Cache local por ano' },
  { num: 3, title: 'Indexar Web Worker', subtitle: 'Agregação instantânea' },
]

function stepState(stepNum: 1 | 2 | 3): 'done' | 'active' | 'pending' {
  if (props.status === 'checking' && stepNum === 1) {
    return 'done'
  }
  if (stepNum < activeStep.value) return 'done'
  if (stepNum === activeStep.value) return 'active'
  return 'pending'
}
</script>

<template>
  <section
    class="loader-shell"
    role="status"
    aria-live="polite"
    :aria-busy="status !== 'error'"
  >
    <!-- Error State -->
    <div v-if="status === 'error'" class="loader-card loader-card--error" role="alert">
      <div class="icon-circle icon-circle--error" aria-hidden="true">
        <AlertTriangle :size="26" />
      </div>
      <h2>Não foi possível carregar os dados do GERCON {{ year }}</h2>
      <p class="error-desc">
        {{ errorMessage || 'Ocorreu um erro inesperado ao consultar a API de Dados Abertos.' }}
      </p>
      <div class="error-tips">
        <p>
          A API CKAN de Dados Abertos de Porto Alegre pode sofrer limitações de taxa ou timeouts
          momentâneos. Você pode tentar novamente agora ou alternar para outro ano no cabeçalho.
        </p>
      </div>
      <button type="button" class="btn btn-primary retry-btn" @click="emit('retry')">
        <RotateCcw :size="15" aria-hidden="true" />
        <span>Tentar novamente</span>
      </button>
    </div>

    <!-- Loading / Progress Stepper State -->
    <div v-else class="loader-card">
      <div class="icon-circle" aria-hidden="true">
        <Cpu v-if="activeStep === 3" :size="26" />
        <Database v-else-if="activeStep === 2" :size="26" />
        <CloudDownload v-else :size="26" />
      </div>

      <h2>
        {{
          status === 'downloading'
            ? `Preparando base real do GERCON ${year}`
            : `Carregando base local do GERCON ${year}`
        }}
      </h2>

      <p class="loader-msg">{{ progress.message }}</p>

      <!-- 3-Step Visual Progress Stepper -->
      <ol class="stepper" aria-label="Etapas de carregamento da base GERCON">
        <li
          v-for="step in steps"
          :key="step.num"
          class="step"
          :class="`step--${stepState(step.num)}`"
          :aria-current="stepState(step.num) === 'active' ? 'step' : undefined"
        >
          <div class="step-indicator" aria-hidden="true">
            <Check v-if="stepState(step.num) === 'done'" :size="14" />
            <Loader2 v-else-if="stepState(step.num) === 'active'" :size="14" class="spin" />
            <span v-else class="tabular-nums">{{ step.num }}</span>
          </div>
          <div class="step-text">
            <span class="step-title">{{ step.title }}</span>
            <span class="step-sub">{{ step.subtitle }}</span>
          </div>
        </li>
      </ol>

      <div
        v-if="status === 'downloading'"
        class="progress-block"
        role="progressbar"
        :aria-valuenow="percent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`Progresso do download: ${percent}%`"
      >
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${Math.max(percent, 4)}%` }" />
        </div>
        <div class="progress-meta tabular-nums">
          <span>
            {{ progress.fetched.toLocaleString('pt-BR') }} /
            {{ progress.target.toLocaleString('pt-BR') }} registros
          </span>
          <strong>{{ percent }}%</strong>
        </div>
      </div>

      <p class="hint">
        Este download ocorre apenas na <strong>primeira vez que o ano {{ year }} é selecionado</strong>.
        Os registros ficam salvos localmente no navegador (IndexedDB) para carregamentos instantâneos
        ao alternar entre anos já baixados.
      </p>
    </div>
  </section>
</template>

<style scoped>
.loader-shell {
  min-height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 12px;
}

.loader-card {
  max-width: 600px;
  width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 32px 28px;
  text-align: center;
}

.loader-card--error {
  border-color: var(--danger-border);
}

.icon-circle {
  width: 56px;
  height: 56px;
  margin: 0 auto 14px;
  border-radius: 14px;
  background: var(--brand-soft);
  border: 1px solid var(--brand-border);
  color: var(--brand-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-circle--error {
  background: var(--danger-bg);
  border-color: var(--danger-border);
  color: var(--danger);
}

h2 {
  margin: 0 0 8px;
  font-size: 1.16rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text-primary);
}

.loader-msg {
  margin: 0 0 22px;
  font-size: 0.88rem;
  color: var(--text-secondary);
}

/* 3-Step Visual Stepper */
.stepper {
  list-style: none;
  margin: 0 0 22px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  text-align: left;
}

@media (max-width: 560px) {
  .stepper {
    grid-template-columns: 1fr;
  }
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--bg-inset);
  transition: border-color var(--transition-fast), background-color var(--transition-fast);
}

.step--active {
  border-color: var(--brand-border);
  background: var(--brand-soft);
}

.step--done {
  border-color: var(--success-border);
  background: var(--success-bg);
}

.step-indicator {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}

.step--active .step-indicator {
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #ffffff;
}

.step--done .step-indicator {
  background: var(--success);
  border-color: var(--success);
  color: #ffffff;
}

.step-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.step-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.25;
}

.step--pending .step-title {
  color: var(--text-muted);
}

.step-sub {
  font-size: 0.71rem;
  color: var(--text-muted);
  margin-top: 2px;
  line-height: 1.25;
}

.progress-block {
  margin: 0 0 18px;
}

.progress-track {
  width: 100%;
  height: 9px;
  border-radius: 999px;
  background: var(--bg-subtle);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #005b96 0%, #0072b2 100%);
  border-radius: 999px;
  transition: width 260ms ease;
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.error-desc {
  margin: 0 0 14px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  color: var(--danger);
  font-size: 0.86rem;
  font-weight: 600;
  text-align: left;
}

.error-tips {
  margin: 0 0 20px;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  text-align: left;
}

.error-tips p {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.45;
}

.retry-btn {
  min-width: 180px;
  padding: 9px 18px;
}

.hint {
  margin: 12px 0 0;
  font-size: 0.79rem;
  color: var(--text-muted);
  line-height: 1.5;
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
</style>
