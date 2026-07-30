import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { Account } from '@journal/shared-types';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { formatUsd } from '../format';

const percentFactor = 100;

/**
 * Resumen del capital de la cuenta seleccionada, o la suma de todas cuando el
 * selector está en «Todas las cuentas». El saldo lo calcula el backend sobre el
 * histórico completo (aportado + neto de trades − fees de data), así que no
 * depende del mes o del año que se esté viendo en el dashboard o en reportes.
 *
 * La variación se mide contra el capital *aportado* (inicial + aportes − retiros),
 * no contra el inicial: así inyectar dinero en agosto sube el saldo sin aparecer
 * como ganancia.
 */
@Component({
  selector: 'journal-capital-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "scope().length > 0 ? 'block' : 'none'",
  },
  templateUrl: './capital-summary.component.html',
  styleUrl: './capital-summary.component.scss',
})
export class CapitalSummaryComponent {
  private readonly accounts = inject(AccountsStore);

  protected readonly formatUsd = formatUsd;

  /** Cuentas que entran en el total: la seleccionada, o todas en modo «ALL». */
  protected readonly scope = computed<Account[]>(() => {
    if (this.accounts.selectedId() === 'ALL') {
      return this.accounts.accounts();
    }
    const selected = this.accounts.selected();
    return selected ? [selected] : [];
  });

  protected readonly contributed = computed(() => this.sumOf('contributedCapital'));
  protected readonly current = computed(() => this.sumOf('currentBalance'));
  protected readonly change = computed(() => this.current() - this.contributed());

  protected readonly changeLabel = computed(() => {
    const change = this.change();
    const amount = change > 0 ? `+${formatUsd(change)}` : formatUsd(change);
    const contributed = this.contributed();
    if (contributed === 0) {
      return amount;
    }
    const percent = (change / contributed) * percentFactor;
    const sign = percent > 0 ? '+' : '';
    return `${amount} · ${sign}${percent.toFixed(2)}%`;
  });

  protected readonly scopeLabel = computed(() => {
    const scope = this.scope();
    if (this.accounts.selectedId() !== 'ALL') {
      return scope[0]?.name ?? '';
    }
    return scope.length === 1 ? '1 cuenta' : `${scope.length} cuentas`;
  });

  protected readonly scopeTooltip =
    'Capital aportado más el neto de los trades, menos el fee de data cobrado';

  protected readonly contributedTooltip =
    'Capital inicial más los aportes registrados, menos los retiros';

  /**
   * Suma un campo decimal de las cuentas en alcance. Los saldos llegan como
   * string para no perder precisión, así que se convierten aquí y no antes.
   * @private
   * @param {'contributedCapital' | 'currentBalance'} field - Campo a sumar
   * @returns {number}
   */
  private sumOf(field: 'contributedCapital' | 'currentBalance'): number {
    return this.scope().reduce((total, account) => total + Number(account[field]), 0);
  }
}
