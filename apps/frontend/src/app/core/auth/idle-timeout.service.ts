import { DestroyRef, Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from './auth.store';

/** Minutos de inactividad antes de cerrar sesión (igual al TTL del access token). */
const IDLE_LIMIT_MS = 15 * 60 * 1000;
/** Throttle: no reiniciamos el timer más de una vez cada 5s aunque haya muchos eventos. */
const RESET_THROTTLE_MS = 5_000;

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
] as const;

@Injectable({ providedIn: 'root' })
export class IdleTimeoutService {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  private timerId: ReturnType<typeof setTimeout> | null = null;
  private lastReset = 0;
  private started = false;
  private readonly onActivity = (): void => this.scheduleReset();
  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible') this.scheduleReset();
  };

  start(destroyRef: DestroyRef): void {
    if (this.started) return;
    this.started = true;

    // Listeners fuera de Angular para no disparar CD en cada mousemove.
    this.zone.runOutsideAngular(() => {
      for (const evt of ACTIVITY_EVENTS) {
        window.addEventListener(evt, this.onActivity, { passive: true });
      }
      document.addEventListener('visibilitychange', this.onVisibility);
    });

    this.resetTimer();

    destroyRef.onDestroy(() => this.stop());
  }

  private scheduleReset(): void {
    const now = Date.now();
    if (now - this.lastReset < RESET_THROTTLE_MS) return;
    this.lastReset = now;
    this.resetTimer();
  }

  private resetTimer(): void {
    if (this.timerId !== null) clearTimeout(this.timerId);
    this.zone.runOutsideAngular(() => {
      this.timerId = setTimeout(() => {
        this.zone.run(() => void this.expire());
      }, IDLE_LIMIT_MS);
    });
  }

  private async expire(): Promise<void> {
    this.stop();
    try {
      await this.auth.logout();
    } finally {
      await this.router.navigateByUrl('/login');
    }
  }

  private stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    for (const evt of ACTIVITY_EVENTS) {
      window.removeEventListener(evt, this.onActivity);
    }
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
