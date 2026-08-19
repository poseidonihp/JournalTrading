import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  monthName,
  monthOptions,
  monthsOfYear,
  yearsFromMonthKeys,
  type IMonthOption,
} from '../months';

/** Selección del filtro; `null` significa «todos». */
export interface IMonthSelection {
  year: number | null;
  month: number | null;
}

/**
 * Selector de periodo en dos pasos: primero el año y después el mes, que se
 * muestra sólo con su nombre porque el año ya está a la vista.
 * @class
 */
@Component({
  selector: 'journal-month-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './month-picker.component.html',
  styleUrl: './month-picker.component.scss',
})
export class MonthPickerComponent {
  readonly year = input<number | null>(null);
  readonly month = input<number | null>(null);
  /** Claves `YYYY-MM` con datos; acotan los años y meses ofrecidos. */
  readonly availableMonths = input<readonly string[]>([]);
  readonly allowAllYears = input<boolean>(false);
  readonly allowAllMonths = input<boolean>(false);
  readonly allYearsLabel = input<string>('Todos los años');
  readonly allMonthsLabel = input<string>('Todos los meses');
  readonly selectionChange = output<IMonthSelection>();

  protected readonly years = computed<number[]>(() => {
    const years = new Set<number>(yearsFromMonthKeys(this.availableMonths()));
    years.add(new Date().getFullYear());
    const selected = this.year();
    if (selected !== null) {
      years.add(selected);
    }
    return Array.from(years).sort((a, b) => b - a);
  });

  protected readonly months = computed<IMonthOption[]>(() => {
    const year = this.year();
    if (year === null) {
      return [...monthOptions];
    }
    const available = this.monthsForYear(year);
    if (available.length === 0) {
      return [...monthOptions];
    }
    return available.map(value => ({ value, label: monthName(value) }));
  });

  protected readonly yearValue = computed(() => {
    const year = this.year();
    return year === null ? '' : String(year);
  });

  protected readonly monthValue = computed(() => {
    const month = this.month();
    return month === null ? '' : String(month);
  });

  /** Sin año no hay mes que elegir: el filtro es de todo el histórico. */
  protected readonly monthDisabled = computed(() => this.year() === null);

  protected onYearChange(value: string): void {
    const year = value === '' ? null : Number(value);
    if (year === null || Number.isNaN(year)) {
      this.selectionChange.emit({ year: null, month: null });
      return;
    }
    this.selectionChange.emit({ year, month: this.resolveMonth(year) });
  }

  protected onMonthChange(value: string): void {
    const month = value === '' ? null : Number(value);
    const year = this.year() ?? new Date().getFullYear();
    this.selectionChange.emit({
      year,
      month: month === null || Number.isNaN(month) ? null : month,
    });
  }

  /** Meses del año con datos; incluye el seleccionado para no perder la selección. */
  private monthsForYear(year: number): number[] {
    const available = monthsOfYear(this.availableMonths(), year);
    const selected = this.month();
    if (selected !== null && available.length > 0 && !available.includes(selected)) {
      available.push(selected);
      available.sort((a, b) => a - b);
    }
    return available;
  }

  /**
   * Mes que queda vigente al cambiar de año: se conserva el actual si ese año
   * lo tiene, y si no se cae al más reciente con datos.
   * @param {number} year - Año recién elegido
   * @returns {number | null}
   */
  private resolveMonth(year: number): number | null {
    const current = this.month();
    if (this.allowAllMonths() && current === null) {
      return null;
    }
    const available = monthsOfYear(this.availableMonths(), year);
    if (available.length === 0) {
      return current ?? this.defaultMonthFor(year);
    }
    if (current !== null && available.includes(current)) {
      return current;
    }
    if (this.allowAllMonths()) {
      return null;
    }
    return available.at(-1) ?? current;
  }

  /** Sin datos de ese año se ofrece el mes en curso, o enero si es otro año. */
  private defaultMonthFor(year: number): number {
    const now = new Date();
    return year === now.getFullYear() ? now.getMonth() + 1 : 1;
  }
}
