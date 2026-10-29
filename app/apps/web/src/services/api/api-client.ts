import {
  ApiClientError,
  type ApiErrorResponse,
  type RequestOptions,
} from '../../types/api.types.js';

export class ApiClient {
  private readonly baseUrl: string;

  public constructor(baseUrl = import.meta.env.VITE_API_BASE_URL ?? '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { body, headers = {}, timeoutMs = 15000, ...customConfig } = options;

    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const method = (customConfig.method ?? 'GET').toUpperCase();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

    const defaultHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...(isMutating ? { 'x-csrf-token': '1' } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    };

    try {
      const response = await fetch(url, {
        ...customConfig,
        method,
        headers: {
          ...defaultHeaders,
          ...(headers as Record<string, string>),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: 'include', // Ensures session cookie is transmitted
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') ?? '';
      const isJson = contentType.includes('application/json');

      if (!response.ok) {
        let code = `HTTP_${response.status}`;
        let message = response.statusText || 'Request failed';
        let requestId: string | undefined;

        if (isJson) {
          try {
            const errorPayload = (await response.json()) as ApiErrorResponse;
            if (errorPayload?.error) {
              code = errorPayload.error.code || code;
              message = errorPayload.error.message || message;
              requestId = errorPayload.error.requestId;
            }
          } catch {
            // Failed to parse JSON error body; fallback to default message
          }
        }

        throw new ApiClientError(message, response.status, code, requestId);
      }

      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return {} as T;
      }

      if (isJson) {
        return (await response.json()) as T;
      }

      return (await response.text()) as unknown as T;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof ApiClientError) {
        throw err;
      }

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiClientError(
          'Request timed out. Please check your network connection.',
          408,
          'TIMEOUT',
        );
      }

      const networkMessage = err instanceof Error ? err.message : 'Network failure occurred';
      throw new ApiClientError(networkMessage, 0, 'NETWORK_ERROR');
    }
  }

  public get<T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T>(
    endpoint: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  public put<T>(
    endpoint: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  public patch<T>(
    endpoint: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  public delete<T>(
    endpoint: string,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
