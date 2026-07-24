import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LucideAngularModule, ChevronDown, Check } from 'lucide-angular';
import { AccountsStore } from '../accounts/accounts.store';

@Component({
  selector: 'app-account-selector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkMenuTrigger, CdkMenu, CdkMenuItem, LucideAngularModule],
  templateUrl: './account-selector.component.html',
})
export class AccountSelectorComponent {
  protected readonly iconChevron = ChevronDown;
  protected readonly iconCheck = Check;
  private readonly store = inject(AccountsStore);

  protected readonly accounts = this.store.accounts;
  protected readonly selectedId = this.store.selectedId;

  protected readonly label = computed(() => {
    const id = this.store.selectedId();
    if (id === 'ALL') return 'Todas las cuentas';
    const sel = this.store.selected();
    return sel ? sel.name : 'Sin cuenta';
  });

  select(id: string | 'ALL'): void {
    this.store.setSelected(id);
  }
}
