/**
 * Acumula itens e os entrega em lotes para `flush`, sem parar a leitura enquanto um lote é gravado.
 *
 * No máximo um flush fica em andamento: ao completar o próximo lote, add() espera o anterior terminar.
 * Assim a leitura segue em paralelo com a gravação, mas recua quando o destino é o gargalo.
 */
export class BatchWriter<T> {
  private currentBatch: T[] = []
  private pendingFlush: Promise<void> = Promise.resolve()

  constructor(
    private readonly batchSize: number,
    private readonly flush: (batch: T[]) => Promise<void>
  ) {}

  async add(item: T): Promise<void> {
    this.currentBatch.push(item)
    if (this.currentBatch.length < this.batchSize) return

    await this.pendingFlush
    this.pendingFlush = this.flush(this.currentBatch)
    // Evita "unhandled rejection" enquanto ninguém espera esta promise; o erro reaparece no próximo await.
    this.pendingFlush.catch(() => {})
    this.currentBatch = []
  }

  /** Espera o flush em andamento e grava o que sobrou. */
  async finish(): Promise<void> {
    await this.pendingFlush
    if (this.currentBatch.length > 0) await this.flush(this.currentBatch)
    this.currentBatch = []
  }
}
