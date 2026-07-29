import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Campo de formulario reutilizable: label `.uplabel` + control proyectado + error opcional.
 * El control nativo se proyecta tal cual y conserva su `formControlName` y su clase
 * (`.field-input` / `.field-select` / `.field-textarea`), por lo que Reactive Forms sigue intacto.
 * Para ancho completo en grid pásale la clase en el host:
 * <journal-field class="md:col-span-2" label="Notas">…</journal-field>
 * Pasa `controlId` con el mismo valor que el `id` del control proyectado para que el
 * `<label>` quede asociado explícitamente vía `for` (necesario para el análisis de accesibilidad).
 */
@Component({
  selector: 'journal-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block' },
  template: `
    <label class="field" [attr.for]="controlId()">
      <span class="uplabel">{{ label() }}</span>
      <ng-content />
      @if (error(); as err) {
        <span class="text-danger text-xs mt-1">{{ err }}</span>
      }
    </label>
  `,
})
export class FieldComponent {
  readonly label = input.required<string>();
  readonly error = input<string | null>(null);
  readonly controlId = input<string>();
}
