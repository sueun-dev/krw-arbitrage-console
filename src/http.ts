export async function fetchJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? 5000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}
