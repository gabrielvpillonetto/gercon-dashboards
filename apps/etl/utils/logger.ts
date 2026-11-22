export function logYear(ano: number, message: string): void {
  console.log(`[${new Date().toISOString()}] [${ano}] ${message}`)
}

/** 1410003 -> "1.410.003" */
export function formatCount(count: number): string {
  return count.toLocaleString('pt-BR')
}
