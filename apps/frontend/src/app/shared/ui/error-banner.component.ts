import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Banner de error reutilizable: caja con fondo/borde clay y el mensaje.
 * No renderiza nada si `message` es falsy (encapsula el `@if`).
 * Para casos en grid (p. ej. ancho completo) pásale la clase en el host:
 * <journal-error-banner class="md:col-span-2" [message]="errorMessage()" />
 */
@Component({
  selector: 'journal-error-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "message() ? 'block' : 'none'",
  },
  template: `
    @if (message(); as msg) {
      <div
        class="rounded-md px-3 py-2 text-xs"
        style="background: rgba(181,80,60,0.1); border: 1px solid rgba(181,80,60,0.3); color: var(--qp-clay);"
        role="alert"
      >
        {{ msg }}
      </div>
    }
  `,
})
export class ErrorBannerComponent {
  readonly message = input<string | null>(null);
}
