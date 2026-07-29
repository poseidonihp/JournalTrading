import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { NotificationService } from '../notifications/notification.service';

/**
 * En 401, intenta refrescar el access token vía /api/auth/refresh y reintenta
 * el request original UNA sola vez. Garantías:
 *  - Single-flight: múltiples 401 concurrentes comparten un único refresh.
 *  - Anti-bucle: no actúa sobre los endpoints de auth ni sobre un request ya reintentado.
 *  - Si el refresh falla, avisa y redirige a login una sola vez.
 */
const RETRY_HEADER = 'X-Retry-After-Refresh';
const HTTP_UNAUTHORIZED = 401;

let refreshing: Promise<boolean> | null = null;
let sessionExpiredHandled = false;

function refreshOnce(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export const authRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  const notify = inject(NotificationService);

  const isAuthEndpoint =
    req.url.includes('/api/auth/login') ||
    req.url.includes('/api/auth/me') ||
    req.url.includes('/api/auth/refresh') ||
    req.url.includes('/api/auth/logout');

  return next(req).pipe(
    catchError((err: unknown) => {
      const is401 = err instanceof HttpErrorResponse && err.status === HTTP_UNAUTHORIZED;
      const canRetry = is401 && !isAuthEndpoint && !req.headers.has(RETRY_HEADER);
      if (!canRetry) {
        return throwError(() => err);
      }
      return from(refreshOnce()).pipe(
        switchMap((ok) => {
          if (!ok) {
            handleSessionExpired(notify);
            return throwError(() => err);
          }
          const retried = req.clone({
            setHeaders: { [RETRY_HEADER]: '1' },
            withCredentials: true,
          });
          return next(retried);
        }),
      );
    }),
  );
};

function handleSessionExpired(notify: NotificationService): void {
  if (sessionExpiredHandled) {
    return;
  }
  sessionExpiredHandled = true;
  notify.warning('Tu sesión expiró. Vuelve a iniciar sesión.', { title: 'Sesión finalizada' });
  try {
    sessionStorage.setItem('journal:logged-out', '1');
  } catch {
    // sessionStorage no disponible: no es crítico.
  }
  globalThis.location.href = '/login';
}
