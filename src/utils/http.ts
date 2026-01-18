/**
 * @fileoverview HTTP utility functions with timeout support.
 */

import { HttpError } from "../core/errors";

/** Default timeout for HTTP requests in milliseconds */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Extended RequestInit with timeout support.
 */
export interface FetchOptions extends RequestInit {
  /** Request timeout in milliseconds. Defaults to 5000ms. */
  timeoutMs?: number;
}

/**
 * Fetches JSON data from a URL with timeout support.
 *
 * @template T - The expected response type
 * @param url - The URL to fetch from
 * @param init - Optional fetch options including timeout
 * @returns Promise resolving to the parsed JSON response
 * @throws {HttpError} When the request fails or returns non-2xx status
 *
 * @example
 * ```typescript
 * interface User { id: number; name: string; }
 * const user = await fetchJson<User>('https://api.example.com/user/1');
 * ```
 */
export async function fetchJson<T>(url: string, init?: FetchOptions): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });

    if (!resp.ok) {
      throw new HttpError(url, resp.status, resp.statusText);
    }

    return (await resp.json()) as T;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(url, 408, `Request timeout after ${timeoutMs}ms`, error);
    }

    throw new HttpError(url, 0, "Network error", error);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches text content from a URL with timeout support.
 *
 * @param url - The URL to fetch from
 * @param init - Optional fetch options including timeout
 * @returns Promise resolving to the text response
 * @throws {HttpError} When the request fails or returns non-2xx status
 */
export async function fetchText(url: string, init?: FetchOptions): Promise<string> {
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });

    if (!resp.ok) {
      throw new HttpError(url, resp.status, resp.statusText);
    }

    return await resp.text();
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(url, 408, `Request timeout after ${timeoutMs}ms`, error);
    }

    throw new HttpError(url, 0, "Network error", error);
  } finally {
    clearTimeout(timeout);
  }
}
