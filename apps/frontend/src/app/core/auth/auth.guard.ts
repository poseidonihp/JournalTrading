import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStore } from './auth.store';

const LOGOUT_FLAG = 'journal:logged-out';

function consumeLogoutFlag(): boolean {
  try {
    if (sessionStorage.getItem(LOGOUT_FLAG) === '1') {
      sessionStorage.removeItem(LOGOUT_FLAG);
      return true;
    }
  } catch {
    // sessionStorage no disponible.
  }
  return false;
}

/**
 * Resuelve el estado de sesión una sola vez por carga de página. `loading()` arranca en
 * true y pasa a false cuando `hydrate()` acaba, así que solo se sondea si el estado aún
 * no se conoce. Tras un logout se salta el sondeo: ya sabemos que no hay sesión.
 * @private
 * @param {AuthStore} auth - Store de autenticación.
 * @returns {Promise<void>}
 */
async function resolveSession(auth: AuthStore): Promise<void> {
  if (consumeLogoutFlag() || auth.isAuthenticated() || !auth.loading()) {
    return;
  }
  await auth.hydrate();
}

/**
 * Rutas privadas: exigen sesión viva. Si la sesión no existe o murió, al login.
 * @returns {Promise<boolean | UrlTree>}
 */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await resolveSession(auth);
  if (auth.isAuthenticated()) {
    return true;
  }
  return router.parseUrl('/login');
};

/**
 * Rutas públicas (landing y login): solo para visitantes sin sesión. Con sesión viva se
 * salta la portada y entra directo al dashboard.
 * @returns {Promise<boolean | UrlTree>} true si la ruta puede activarse, o el UrlTree de redirección.
 */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await resolveSession(auth);
  if (!auth.isAuthenticated()) {
    return true;
  }
  return router.parseUrl('/dashboard');
};
