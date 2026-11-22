/** fetch com novas tentativas e espera crescente (2s, 4s, ...) para falhas de rede ou HTTP. */
export async function fetchWithRetry(
  url: string,
  signal?: AbortSignal,
  maxAttempts = 3
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`)
      return response
    } catch (error) {
      if (attempt >= maxAttempts || signal?.aborted) throw error
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
    }
  }
}
