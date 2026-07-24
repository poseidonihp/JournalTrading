import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotificationHostComponent } from './core/notifications/notification-host.component';
import { ConfirmHostComponent } from './core/confirm/confirm-host.component';

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
export class App {}
