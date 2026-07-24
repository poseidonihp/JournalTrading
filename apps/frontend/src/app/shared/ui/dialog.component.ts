import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideAngularModule, X } from 'lucide-angular';

/**
 * Shell de diálogo reutilizable: panel con header (título + cerrar) y footer.
 * El cuerpo y el footer se proyectan por slots para no acoplar la lógica del formulario:
 *
 * <journal-dialog title="Nuevo trade" (closed)="cancel()">
 *   <form dialog-body ...>…</form>
 *   <div dialog-footer class="contents">…botones…</div>
 * </journal-dialog>
 *
 * El cuerpo proyectado controla su propio padding/scroll (p. ej. `flex-1 overflow-y-auto px-7 py-6`).
 */
@Component({
  selector: 'journal-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  host: { style: 'display: contents' },
  template: `
    <div class="panel flex max-h-[90vh] flex-col overflow-hidden rounded-xl" [class]="widthClass()">
      <header
        class="flex items-center justify-between px-7 pb-4 pt-6"
        style="border-bottom: 1px solid var(--qp-line);"
      >
        <div>
          @if (subtitle()) {
            <div class="uplabel">{{ subtitle() }}</div>
          }
          <h2 class="serif text-[28px] leading-none">{{ title() }}</h2>
        </div>
        <button type="button" (click)="closed.emit()" class="icon-btn" aria-label="Cerrar">
          <lucide-icon [name]="iconClose" class="h-4 w-4"></lucide-icon>
        </button>
      </header>

      <ng-content select="[dialog-body]" />

      <footer
        class="flex items-center justify-end gap-2 px-7 py-4"
        style="border-top: 1px solid var(--qp-line); background: var(--qp-bg-soft);"
      >
        <ng-content select="[dialog-footer]" />
      </footer>
    </div>
  `,
})
export class DialogComponent {
  protected readonly iconClose = X;

  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  /** Clases Tailwind para el ancho del panel. */
  readonly widthClass = input<string>('w-[min(880px,95vw)]');

  readonly closed = output<void>();
}
