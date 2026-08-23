import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { MentorBucket, MentorDigest, MentorDimensionId } from '@journal/shared-types';
import { formatUsd } from '../../shared/format';
import {
  confidenceClass,
  confidenceLabel,
  formatPct,
  formatPf,
  winRateClass,
} from './mentor.labels';

/** Opción del selector de dimensión. */
interface IDimensionOption {
  id: MentorDimensionId;
  label: string;
}

/**
 * Tabla de verificación: los mismos números que vio el modelo, ordenados por
 * neto ascendente para que lo que más sangra quede arriba. A propósito sin gráfico.
 * @class
 */
@Component({
  selector: 'app-mentor-digest',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mentor-digest.component.html',
  styleUrl: './mentor-digest.component.scss',
})
export class MentorDigestComponent {
  readonly digest = input.required<MentorDigest | null>();

  protected readonly formatUsd = formatUsd;
  protected readonly formatPct = formatPct;
  protected readonly formatPf = formatPf;
  protected readonly winRateClass = winRateClass;
  protected readonly confidenceLabel = confidenceLabel;
  protected readonly confidenceClass = confidenceClass;

  private readonly requested = signal<MentorDimensionId | null>(null);

  protected readonly options = computed<IDimensionOption[]>(
    () => this.digest()?.dimensions.map(dim => ({ id: dim.id, label: dim.label })) ?? [],
  );

  protected readonly selectedId = computed<MentorDimensionId | null>(() => {
    const requested = this.requested();
    const options = this.options();
    if (requested && options.some(option => option.id === requested)) {
      return requested;
    }
    return options[0]?.id ?? null;
  });

  protected readonly buckets = computed<MentorBucket[]>(() => {
    const dimension = this.digest()?.dimensions.find(dim => dim.id === this.selectedId());
    return [...(dimension?.buckets ?? [])].sort(
      (a, b) => Number(a.netBeforeDataFees) - Number(b.netBeforeDataFees),
    );
  });

  protected onDimensionChange(value: string): void {
    this.requested.set(value as MentorDimensionId);
  }
}
