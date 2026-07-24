import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideAngularModule, Loader, type LogIn } from 'lucide-angular';

/**
 * Botón de envío con estado de carga: muestra spinner + `loadingLabel` mientras `loading`.
 * Reutiliza `.pill.pill-solid`. El host usa `display: contents` para heredar el layout del
 * contenedor (stretch en columnas, alineación en footers).
 *
 * Dentro de un <form> usa `type="submit"` (default) para disparar `ngSubmit`/Enter.
 * En un footer fuera del form usa `type="button"` + `(clicked)`.
 */
@Component({
  selector: 'journal-submit-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  host: { style: 'display: contents' },
  template: `
    <button
      [type]="type()"
      class="pill pill-solid"
      [class]="extraClass()"
      [disabled]="loading() || disabled()"
      (click)="clicked.emit()"
    >
      @if (loading()) {
        <lucide-icon [name]="iconLoader" class="h-4 w-4 animate-spin"></lucide-icon>
      } @else if (icon(); as ic) {
        <lucide-icon [name]="ic" class="h-4 w-4"></lucide-icon>
      }
      <span>{{ loading() ? (loadingLabel() ?? label()) : label() }}</span>
    </button>
  `,
})
export class SubmitButtonComponent {
  protected readonly iconLoader = Loader;

  readonly label = input.required<string>();
  readonly loadingLabel = input<string>();
  readonly loading = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly icon = input<typeof LogIn>();
  readonly type = input<'submit' | 'button'>('submit');
  /** Clases extra para el botón (p. ej. `mt-2 justify-center`). */
  readonly extraClass = input<string>('');

  readonly clicked = output<void>();
}
