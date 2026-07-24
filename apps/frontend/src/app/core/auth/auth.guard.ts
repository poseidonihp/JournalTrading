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

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const justLoggedOut = consumeLogoutFlag();
  if (!justLoggedOut && !auth.isAuthenticated() && !auth.loading()) {
    await auth.hydrate();
  }
  if (auth.isAuthenticated()) return true;
  return router.parseUrl('/login');
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const justLoggedOut = consumeLogoutFlag();
  if (!justLoggedOut && !auth.isAuthenticated() && auth.loading()) {
    await auth.hydrate();
  }
  if (!auth.isAuthenticated()) return true;
  return router.parseUrl('/trades');
};
