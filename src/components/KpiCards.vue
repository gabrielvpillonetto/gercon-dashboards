<script setup lang="ts">
import { computed } from 'vue'
import { CalendarCheck2, Clock, Hourglass, Layers, Stethoscope } from 'lucide-vue-next'
import { STATUS_BG_SOFT, STATUS_COLORS } from '@/constants/palette'
import type { KpiSummary } from '@/types/gercon'

const props = defineProps<{
  kpis: KpiSummary
}>()

const taxaAgendadas = computed(() =>
  props.kpis.total > 0 ? (props.kpis.agendado / props.kpis.total) * 100 : 0
)

function fmt(n: number): string {
  return n.toLocaleString('pt-BR')
}

function fmtPct(n: number): string {
  return `${n.toFixed(1).replace('.', ',')}%`
}

function clampPct(n: number): string {
  return `${Math.min(100, Math.max(0, n)).toFixed(1)}%`
}
</script>

<template>
  <section class="kpi-grid" aria-label="Indicadores principais da fila de consultas">
    <!-- 1. Total -->
    <article class="kpi-card">
      <div class="kpi-head">
        <span class="kpi-label">Total de Solicitações</span>
        <span class="kpi-icon-badge kpi-icon-badge--brand" aria-hidden="true">
          <Layers :size="16" />
        </span>
      </div>
      <div class="kpi-value tabular-nums">{{ fmt(kpis.total) }}</div>
      <div class="kpi-sub tabular-nums">
        <strong>{{ fmt(kpis.especialidadesAtivas) }}</strong> especialidades •
        <strong>{{ fmt(kpis.unidadesExecutantesAtivas) }}</strong> unidades
      </div>
    </article>

    <!-- 2. Aguardando -->
    <article class="kpi-card" :style="{ borderTopColor: STATUS_COLORS.Aguardando }">
      <div class="kpi-head">
        <span class="kpi-label">Aguardando na Fila</span>
        <span
          class="kpi-icon-badge"
          :style="{ backgroundColor: STATUS_BG_SOFT.Aguardando, color: STATUS_COLORS.Aguardando }"
          aria-hidden="true"
        >
          <Hourglass :size="16" />
        </span>
      </div>
      <div class="kpi-value-row">
        <span class="kpi-value tabular-nums">{{ fmt(kpis.aguardando) }}</span>
        <span class="kpi-rate tabular-nums">{{ fmtPct(kpis.taxaAguardando) }}</span>
      </div>
      <div class="kpi-bar-track" aria-hidden="true">
        <div
          class="kpi-bar-fill"
          :style="{
            width: clampPct(kpis.taxaAguardando),
            backgroundColor: STATUS_COLORS.Aguardando,
          }"
        />
      </div>
      <div class="kpi-sub">Proporção aguardando no recorte filtrado</div>
    </article>

    <!-- 3. Atendidas -->
    <article class="kpi-card" :style="{ borderTopColor: STATUS_COLORS.Atendido }">
      <div class="kpi-head">
        <span class="kpi-label">Consultas Atendidas</span>
        <span
          class="kpi-icon-badge"
          :style="{ backgroundColor: STATUS_BG_SOFT.Atendido, color: STATUS_COLORS.Atendido }"
          aria-hidden="true"
        >
          <Stethoscope :size="16" />
        </span>
      </div>
      <div class="kpi-value-row">
        <span class="kpi-value tabular-nums">{{ fmt(kpis.atendido) }}</span>
        <span class="kpi-rate tabular-nums">{{ fmtPct(kpis.taxaAtendimento) }}</span>
      </div>
      <div class="kpi-bar-track" aria-hidden="true">
        <div
          class="kpi-bar-fill"
          :style="{
            width: clampPct(kpis.taxaAtendimento),
            backgroundColor: STATUS_COLORS.Atendido,
          }"
        />
      </div>
      <div class="kpi-sub">Taxa efetiva de atendimento concluído</div>
    </article>

    <!-- 4. Agendadas -->
    <article class="kpi-card" :style="{ borderTopColor: STATUS_COLORS.Agendado }">
      <div class="kpi-head">
        <span class="kpi-label">Consultas Agendadas</span>
        <span
          class="kpi-icon-badge"
          :style="{ backgroundColor: STATUS_BG_SOFT.Agendado, color: STATUS_COLORS.Agendado }"
          aria-hidden="true"
        >
          <CalendarCheck2 :size="16" />
        </span>
      </div>
      <div class="kpi-value-row">
        <span class="kpi-value tabular-nums">{{ fmt(kpis.agendado) }}</span>
        <span class="kpi-rate tabular-nums">{{ fmtPct(taxaAgendadas) }}</span>
      </div>
      <div class="kpi-bar-track" aria-hidden="true">
        <div
          class="kpi-bar-fill"
          :style="{
            width: clampPct(taxaAgendadas),
            backgroundColor: STATUS_COLORS.Agendado,
          }"
        />
      </div>
      <div class="kpi-sub tabular-nums">
        Canceladas: <strong>{{ fmt(kpis.cancelado) }}</strong> • Devolvidas:
        <strong>{{ fmt(kpis.devolvido) }}</strong>
      </div>
    </article>

    <!-- 5. Mediana de Espera -->
    <article class="kpi-card">
      <div class="kpi-head">
        <span class="kpi-label">Mediana de Espera</span>
        <span class="kpi-icon-badge kpi-icon-badge--brand" aria-hidden="true">
          <Clock :size="16" />
        </span>
      </div>
      <div class="kpi-value tabular-nums">
        {{ kpis.medianaEspera !== null ? `${fmt(kpis.medianaEspera)} dias` : '—' }}
      </div>
      <div class="wait-sub-grid tabular-nums" aria-label="Percentil 90 e média de espera">
        <span class="wait-mini-pill">
          <span class="mini-k">P90</span>
          <strong class="mini-v">{{ kpis.p90Espera !== null ? `${fmt(kpis.p90Espera)}d` : '—' }}</strong>
        </span>
        <span class="wait-mini-pill">
          <span class="mini-k">Média</span>
          <strong class="mini-v">{{ kpis.mediaEspera !== null ? `${fmt(kpis.mediaEspera)}d` : '—' }}</strong>
        </span>
      </div>
    </article>
  </section>
</template>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

@media (max-width: 1220px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}

.kpi-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-top: 3.5px solid var(--brand-primary);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast),
    border-color var(--transition-fast);
}

.kpi-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.kpi-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.kpi-label {
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.kpi-icon-badge {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-icon-badge--brand {
  background: var(--brand-soft);
  color: var(--brand-primary);
}

.kpi-value-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}

.kpi-value {
  margin-top: 8px;
  font-size: 1.52rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1.15;
}

.kpi-value-row .kpi-value {
  margin-top: 0;
}

.kpi-rate {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.kpi-bar-track {
  margin-top: 8px;
  width: 100%;
  height: 5px;
  border-radius: 999px;
  background: var(--bg-subtle);
  overflow: hidden;
}

.kpi-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 320ms cubic-bezier(0.2, 0, 0, 1);
}

.kpi-sub {
  margin-top: 8px;
  font-size: 0.76rem;
  color: var(--text-muted);
  line-height: 1.35;
}

.kpi-sub strong {
  color: var(--text-secondary);
  font-weight: 600;
}

.wait-sub-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.wait-mini-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-inset);
  border: 1px solid var(--border-subtle);
  font-size: 0.74rem;
}

.mini-k {
  color: var(--text-muted);
  font-weight: 600;
}

.mini-v {
  color: var(--text-primary);
  font-weight: 700;
}
</style>
