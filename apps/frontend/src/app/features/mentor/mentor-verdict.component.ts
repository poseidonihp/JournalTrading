import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { MentorAdvice, MentorDigest } from '@journal/shared-types';
import { bucketLabel } from './mentor.labels';

/** Referencia ya resuelta a etiqueta legible del digest. */
interface IRefChip {
  label: string;
}

/**
 * Todo el texto del modelo en una sola tarjeta: diagnóstico, reglas y foco.
 * El disclaimer es constante nuestra, no un campo que el modelo escriba.
 * @class
 */
@Component({
  selector: 'app-mentor-verdict',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mentor-verdict.component.html',
  styleUrl: './mentor-verdict.component.scss',
})
export class MentorVerdictComponent {
  readonly advice = input.required<MentorAdvice | null>();
  readonly digest = input.required<MentorDigest | null>();
  readonly model = input<string | null>(null);

  protected readonly disclaimer =
    'Análisis generado por IA sobre tus datos. No es asesoría financiera y los contrafácticos no predicen resultados.';

  protected readonly diagnosisRefs = computed<IRefChip[]>(() =>
    this.chipsFor(this.advice()?.diagnosis.refs ?? []),
  );

  protected readonly focusRefs = computed<IRefChip[]>(() =>
    this.chipsFor(this.advice()?.focus.refs ?? []),
  );

  protected refsOf(index: number): IRefChip[] {
    return this.chipsFor(this.advice()?.rules[index]?.refs ?? []);
  }

  /**
   * Traduce las referencias a etiquetas del digest. Una referencia que ya no
   * existe no se muestra: no puede presentarse como evidencia.
   * @private
   * @param {MentorAdvice['diagnosis']['refs']} refs - Referencias del modelo
   * @returns {IRefChip[]}
   */
  private chipsFor(refs: MentorAdvice['diagnosis']['refs']): IRefChip[] {
    const digest = this.digest();
    return refs
      .filter(ref => bucketLabel(digest, ref.dimensionId, ref.bucketKey) !== ref.bucketKey)
      .map(ref => ({ label: bucketLabel(digest, ref.dimensionId, ref.bucketKey) }));
  }
}
