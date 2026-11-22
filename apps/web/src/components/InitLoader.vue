<script setup lang="ts">
import { AlertTriangle, Database, Loader2, RotateCcw } from 'lucide-vue-next'
import type { GerconYear } from '@/types/gercon'

defineProps<{
  year: GerconYear
  status: 'loading' | 'error'
  errorMessage: string | null
}>()

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <section
    class="loader-shell"
    role="status"
    aria-live="polite"
    :aria-busy="status !== 'error'"
  >
    <div v-if="status === 'error'" class="loader-card loader-card--error" role="alert">
      <div class="icon-circle icon-circle--error" aria-hidden="true">
        <AlertTriangle :size="26" />
      </div>
      <h2>Não foi possível carregar os dados do GERCON {{ year }}</h2>
      <p class="error-desc">
        {{ errorMessage || 'Ocorreu um erro inesperado ao consultar o banco de dados.' }}
      </p>
      <div class="error-tips">
        <p>
          Verifique se o Supabase está acessível (localmente: <code>npx supabase start</code>) e
          tente novamente, ou escolha outro ano no cabeçalho.
        </p>
      </div>
      <button type="button" class="btn btn-primary retry-btn" @click="emit('retry')">
        <RotateCcw :size="15" aria-hidden="true" />
        <span>Tentar novamente</span>
      </button>
    </div>

    <div v-else class="loader-card">
      <div class="icon-circle" aria-hidden="true">
        <Database :size="26" />
      </div>
      <h2>Calculando indicadores do GERCON {{ year }}</h2>
      <p class="loader-msg">
        <Loader2 :size="14" class="spin inline-icon" aria-hidden="true" />
        Agregando todas as solicitações do ano no banco de dados...
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
  margin: 0;
  font-size: 0.88rem;
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

.inline-icon {
  vertical-align: -2px;
  margin-right: 4px;
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
