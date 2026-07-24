import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const JSON_HEADERS = new HttpHeaders({
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

interface ApiErrorBody {
  message?: string | string[];
  errors?: { path?: string; message?: string }[];
}

/**
 * Wrapper sobre HttpClient con baseUrl relativa (proxy de Angular maneja /api).
 * Centraliza credenciales y manejo básico de errores.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  get<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
    return firstValueFrom(
      this.http.get<T>(this.url(path), {
        params: ApiClient.toParams(params),
        withCredentials: true,
      }),
    );
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    ApiClient.guardBody('POST', path, body);
    return firstValueFrom(
      this.http.post<T>(this.url(path), body ?? {}, {
        headers: JSON_HEADERS,
        withCredentials: true,
      }),
    );
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    ApiClient.guardBody('PATCH', path, body);
    return firstValueFrom(
      this.http.patch<T>(this.url(path), body ?? {}, {
        headers: JSON_HEADERS,
        withCredentials: true,
      }),
    );
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    ApiClient.guardBody('PUT', path, body);
    return firstValueFrom(
      this.http.put<T>(this.url(path), body ?? {}, {
        headers: JSON_HEADERS,
        withCredentials: true,
      }),
    );
  }

  /** Avisa por consola si una mutación va con body vacío (suele indicar bug). */
  private static guardBody(method: string, path: string, body: unknown): void {
    if (body && typeof body === 'object' && Object.keys(body as object).length === 0) {
      // eslint-disable-next-line no-console
      console.warn(`[ApiClient] ${method} ${path} se está enviando con body vacío`);
    }
  }

  delete<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(this.url(path), { withCredentials: true }));
  }

  postForm<T>(path: string, form: FormData): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(this.url(path), form, { withCredentials: true }),
    );
  }

  /** Devuelve la URL absoluta (relativa al origen) para descargas (e.g. CSV). */
  absoluteUrl(path: string): string {
    return this.url(path);
  }

  static messageFromError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      return ApiClient.messageFromHttpError(err);
    }
    return err instanceof Error ? err.message : 'Error desconocido';
  }

  private static messageFromHttpError(err: HttpErrorResponse): string {
    const body = err.error as ApiErrorBody | string | null;
    if (typeof body === 'string') {
      return body;
    }
    if (!body) {
      return err.message;
    }
    const detailed = ApiClient.formatErrorDetails(body);
    if (detailed) {
      return detailed;
    }
    if (typeof body.message === 'string') {
      return body.message;
    }
    if (Array.isArray(body.message)) {
      return body.message.join('; ');
    }
    return err.message;
  }

  private static formatErrorDetails(body: ApiErrorBody): string | null {
    if (!Array.isArray(body.errors) || body.errors.length === 0) {
      return null;
    }
    const details = body.errors
      .map(e => ApiClient.formatErrorItem(e))
      .filter(s => s.length > 0)
      .join('; ');
    if (!details) {
      return null;
    }
    const head = typeof body.message === 'string' ? `${body.message} — ` : '';
    return `${head}${details}`;
  }

  private static formatErrorItem(e: { path?: string; message?: string }): string {
    const msg = e.message ?? '';
    return e.path ? `${e.path}: ${msg}`.trim() : msg;
  }

  private url(path: string): string {
    if (path.startsWith('/')) return path;
    return `/api/${path}`;
  }

  private static toParams(
    obj: Record<string, string | number | boolean | undefined | null> | undefined,
  ): HttpParams | undefined {
    if (!obj) return undefined;
    let params = new HttpParams();
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null || v === '') continue;
      params = params.set(k, String(v));
    }
    return params;
  }
}
