import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  LucideAngularModule,
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  X,
} from 'lucide-angular';
import { NotificationService, type NotificationKind } from './notification.service';

const ICONS: Record<NotificationKind, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

/** Render de los toasts. Se monta una sola vez en la raíz de la app. */
@Component({
  selector: 'app-notification-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <div class="toast-stack" role="region" aria-label="Notificaciones" aria-live="polite">
      @for (n of notifications.items(); track n.id) {
        <div class="toast" [attr.data-kind]="n.kind" role="status">
          <lucide-icon [name]="icon(n.kind)" class="toast-icon h-4 w-4" aria-hidden="true" />
          <div class="toast-body">
            @if (n.title) {
              <div class="toast-title">{{ n.title }}</div>
            }
            <div class="toast-msg">{{ n.message }}</div>
          </div>
          <button
            type="button"
            class="toast-close"
            (click)="notifications.dismiss(n.id)"
            aria-label="Descartar notificación"
          >
            <lucide-icon [name]="iconClose" class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      }
    </div>
  `,
  styleUrl: './notification-host.component.scss',
})
export class NotificationHostComponent {
  protected readonly notifications = inject(NotificationService);
  protected readonly iconClose = X;

  protected icon(kind: NotificationKind): typeof Info {
    return ICONS[kind];
  }
}
