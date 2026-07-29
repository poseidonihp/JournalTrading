import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotificationHostComponent } from './core/notifications/notification-host.component';
import { ConfirmHostComponent } from './core/confirm/confirm-host.component';
import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, NotificationHostComponent, ConfirmHostComponent],
  template: `
    <router-outlet />
    <app-notification-host />
    <app-confirm-host />
  `,
})
export class App {

  /**
   * Instancia ThemeService en el arranque para que la clase `.dark` se aplique en
   * cualquier ruta. Antes solo lo inyectaba el shell, así que el login ignoraba el
   * tema guardado y siempre se pintaba en claro.
   * @constructor
   */
  constructor() {
    inject(ThemeService);
  }
}
