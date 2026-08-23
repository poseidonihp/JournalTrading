import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { MentorAdvice, MentorBucket, MentorDigest } from '@journal/shared-types';
import { formatUsd } from '../../shared/format';
import {
  confidenceClass,
  confidenceLabel,
  dimensionLabel,
  findBucket,
  formatPct,
  formatPf,
  winRateClass,
} from './mentor.labels';

/** Fuga con los stats reales de su bucket al lado. */
interface ILeakRow {
  text: string;
  label: string;
  dimensionLabel: string;
  bucket: MentorBucket | null;
}

/**
 * Las fugas que señaló el modelo, cada una con las cifras verificadas de su
 * bucket. Sin fortalezas: el presupuesto se gasta en lo que hay que corregir.
 * @class
 */
@Component({
  selector: 'app-mentor-leaks',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mentor-leaks.component.html',
  styleUrl: './mentor-leaks.component.scss',
})
export class MentorLeaksComponent {
  readonly advice = input.required<MentorAdvice | null>();
  readonly digest = input.required<MentorDigest | null>();

  protected readonly formatUsd = formatUsd;
  protected readonly formatPct = formatPct;
  protected readonly formatPf = formatPf;
  protected readonly winRateClass = winRateClass;
  protected readonly confidenceLabel = confidenceLabel;
  protected readonly confidenceClass = confidenceClass;

  protected readonly rows = computed<ILeakRow[]>(() => {
    const digest = this.digest();
    return (this.advice()?.leaks ?? []).map(leak => {
      const bucket = findBucket(digest, leak.dimensionId, leak.bucketKey);
      return {
        text: leak.text,
        label: bucket?.label ?? leak.bucketKey,
        dimensionLabel: dimensionLabel(leak.dimensionId),
        bucket,
      };
    });
  });
}
