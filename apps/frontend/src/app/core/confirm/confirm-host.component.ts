import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { LucideAngularModule, TriangleAlert, CircleQuestionMark } from 'lucide-angular';
import { ConfirmService } from './confirm.service';

/** Render del diálogo de confirmación. Se monta una sola vez en la raíz de la app. */
@Component({
  selector: 'app-confirm-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    @if (confirm.request(); as r) {
      <div class="confirm-overlay" role="presentation" (click)="confirm.resolve(false)">
        <div
          class="confirm-card"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-label]="r.title || r.message"
          (click)="$event.stopPropagation()"
        >
          <div class="confirm-body">
            <span class="confirm-icon" [attr.data-tone]="r.tone" aria-hidden="true">
              <lucide-icon [name]="r.tone === 'danger' ? iconDanger : iconAsk" class="h-5 w-5" />
            </span>
            <div class="min-w-0">
              @if (r.title) {
                <h2 class="confirm-title serif">{{ r.title }}</h2>
              }
              <p class="confirm-msg">{{ r.message }}</p>
            </div>
          </div>

          <footer class="confirm-actions">
            <button type="button" class="pill" (click)="confirm.resolve(false)">
              {{ r.cancelLabel }}
            </button>
            <button
              #confirmBtn
              type="button"
              class="pill pill-solid"
              [attr.data-tone]="r.tone"
              (click)="confirm.resolve(true)"
            >
              {{ r.confirmLabel }}
            </button>
          </footer>
        </div>
      </div>
    }
  `,
  styleUrl: './confirm-host.component.scss',
})
export class ConfirmHostComponent {
  protected readonly confirm = inject(ConfirmService);
  protected readonly iconDanger = TriangleAlert;
  protected readonly iconAsk = CircleQuestionMark;

  private readonly confirmBtn = viewChild<ElementRef<HTMLButtonElement>>('confirmBtn');

  constructor() {
    // Al abrirse el diálogo, mover el foco al botón de confirmación (zoneless: el
    // signal `request` agenda el render y el efecto corre después).
    effect(() => {
      if (this.confirm.request()) {
        queueMicrotask(() => this.confirmBtn()?.nativeElement.focus());
      }
    });
  }

  protected onEscape(): void {
    if (this.confirm.request()) {
      this.confirm.resolve(false);
    }
  }
}
