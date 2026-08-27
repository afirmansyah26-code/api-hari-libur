import { HolidayProviderError } from '../holiday-provider';

export interface FetchHtmlOptions {
  timeoutMs?: number;
  userAgent?: string;
  fetchFn?: typeof fetch;
}

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Fetches HTML from upstream provider with timeout, user-agent, and error wrapping.
 */
export async function fetchHtml(
  providerId: string,
  url: string,
  options?: FetchHtmlOptions
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;
  const fetchFn = options?.fetchFn ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
    });

    if (!response.ok) {
      throw new HolidayProviderError(
        providerId,
        `Failed to fetch holiday data from ${providerId} for URL ${url}: HTTP ${response.status} ${response.statusText}`
      );
    }

    return await response.text();
  } catch (err: unknown) {
    if (err instanceof HolidayProviderError) {
      throw err;
    }

    if (err instanceof Error && err.name === 'AbortError') {
      throw new HolidayProviderError(
        providerId,
        `Request to ${providerId} timed out after ${timeoutMs}ms for URL ${url}`,
        { cause: err }
      );
    }

    throw new HolidayProviderError(
      providerId,
      `Network or fetch failure for ${providerId} at ${url}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err }
    );
  } finally {
    clearTimeout(timer);
  }
}
