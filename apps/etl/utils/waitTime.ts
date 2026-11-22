const MILLISECONDS_PER_DAY = 86_400_000
const MAX_PLAUSIBLE_WAIT_DAYS = 3650

/**
 * Dias de espera da solicitação: diferença entre solicitação e agendamento quando houver;
 * caso contrário, o diasfilaespera da fonte. Valores fora de 0..3650 viram null.
 */
export function calculateWaitDays(
  dataSolicitacao: string,
  dataAgendamento: string | null,
  diasFilaFonte: number | null
): number | null {
  if (dataAgendamento) {
    const days = Math.round(
      (Date.parse(dataAgendamento) - Date.parse(dataSolicitacao)) / MILLISECONDS_PER_DAY
    )
    if (isPlausibleWait(days)) return days
  }
  return diasFilaFonte !== null && isPlausibleWait(diasFilaFonte) ? diasFilaFonte : null
}

function isPlausibleWait(days: number): boolean {
  return days >= 0 && days <= MAX_PLAUSIBLE_WAIT_DAYS
}
