import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EllipsisVertical, LucideAngularModule, X } from 'lucide-angular';
import type {
  CreateTrackerAccountDto,
  ResetTrackerAccountDto,
  TrackerAccount,
  TrackerAccountStatus,
  TrackerAccountType,
  UpdateTrackerAccountStatusDto,
  WithdrawTrackerAccountDto,
} from '@journal/shared-types';
import { ApiClient } from '../../core/http/api.client';
import { ConfirmService } from '../../core/confirm/confirm.service';
import { formatUsd } from '../../shared/format';

type SortField =
  | 'name'
  | 'type'
  | 'status'
  | 'company'
  | 'totalExpenses'
  | 'totalProfits'
  | 'netProfit';
type SortDirection = 'asc' | 'desc';

interface ResetFormData {
  name: string;
  price: number | null;
  date: string;
}

interface WithdrawFormData {
  name: string;
  amount: number | null;
  date: string;
}

interface CreateFormData {
  name: string;
  type: TrackerAccountType;
  status: TrackerAccountStatus;
  company: string;
  totalExpenses: number | null;
  totalProfits: number | null;
}

const EMPTY_CREATE_FORM: CreateFormData = {
  name: '',
  type: 'EVALUATION',
  status: 'ACTIVE',
  company: '',
  totalExpenses: null,
  totalProfits: null,
};

type CreateTextField = 'name' | 'company' | 'type' | 'status';
type CreateNumberField = 'totalExpenses' | 'totalProfits';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-accounts-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './accounts.page.html',
  styleUrl: './accounts.page.scss',
})
export class AccountsPage implements OnInit {
  protected readonly iconMore = EllipsisVertical;
  protected readonly iconClose = X;
  protected readonly formatUsd = formatUsd;

  private readonly api = inject(ApiClient);
  private readonly confirm = inject(ConfirmService);

  protected readonly accounts = signal<readonly TrackerAccount[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedType = signal<'' | TrackerAccountType>('');
  protected readonly selectedStatus = signal<'' | TrackerAccountStatus>('');
  protected readonly sortField = signal<SortField | ''>('');
  protected readonly sortDirection = signal<SortDirection>('asc');

  protected readonly selectedAccount = signal<TrackerAccount | null>(null);
  protected readonly resetForm = signal<ResetFormData>({ name: '', price: null, date: todayIso() });
  protected readonly withdrawForm = signal<WithdrawFormData>({ name: '', amount: null, date: todayIso() });

  protected readonly createForm = signal<CreateFormData>({ ...EMPTY_CREATE_FORM });
  protected readonly creating = signal<boolean>(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly isCreateFormValid = computed<boolean>(() => {
    const f = this.createForm();
    return f.name.trim().length > 0 && f.company.trim().length > 0;
  });

  private readonly actionDialog = viewChild.required<ElementRef<HTMLDialogElement>>('actionDialog');
  private readonly resetDialog = viewChild.required<ElementRef<HTMLDialogElement>>('resetDialog');
  private readonly withdrawDialog = viewChild.required<ElementRef<HTMLDialogElement>>('withdrawDialog');
  private readonly createDialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');

  protected readonly filteredAccounts = computed<readonly TrackerAccount[]>(() => {
    const type = this.selectedType();
    const status = this.selectedStatus();
    const field = this.sortField();
    const direction = this.sortDirection();

    const filtered = this.accounts().filter(a => {
      const typeOk = !type || a.type === type;
      const statusOk = !status || a.status === status;
      return typeOk && statusOk;
    });

    if (!field) {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return direction === 'asc' ? cmp : -cmp;
    });
  });

  ngOnInit(): void {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.api.get<TrackerAccount[]>('tracker-accounts');
      this.accounts.set(rows);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected sortBy(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDirection.update(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortField.set(field);
      this.sortDirection.set('asc');
    }
  }

  protected onSortKeyDown(event: KeyboardEvent, field: SortField): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.sortBy(field);
    }
  }

  protected sortIndicator(field: SortField): string {
    if (this.sortField() !== field) {
      return '';
    }
    return this.sortDirection() === 'asc' ? '▲' : '▼';
  }

  protected getTypeBadgeClass(type: TrackerAccountType): string {
    return `type-badge type-${type.toLowerCase()}`;
  }

  protected getStatusClass(status: TrackerAccountStatus): string {
    return `status-${status.toLowerCase()}`;
  }

  protected getProfitClass(netProfit: number): string {
    if (netProfit > 0) {
      return 'pnl-positive';
    }
    if (netProfit < 0) {
      return 'pnl-negative';
    }
    return 'pnl-zero';
  }

  protected typeLabel(type: TrackerAccountType): string {
    return type === 'EVALUATION' ? 'Evaluation' : 'Live';
  }

  protected statusLabel(status: TrackerAccountStatus): string {
    return status === 'ACTIVE' ? 'Active' : 'Suspended';
  }

  protected openActionModal(account: TrackerAccount): void {
    this.selectedAccount.set(account);
    this.actionDialog().nativeElement.showModal();
  }

  protected closeActionModal(): void {
    this.actionDialog().nativeElement.close();
  }

  protected onActionDialogClose(): void {
    // Sin acción: el estado se limpia explícitamente desde cada handler.
  }

  protected openResetModal(): void {
    const acc = this.selectedAccount();
    if (!acc) {
      return;
    }
    this.resetForm.set({ name: acc.name, price: null, date: todayIso() });
    this.closeActionModal();
    this.resetDialog().nativeElement.showModal();
  }

  protected closeResetModal(): void {
    this.resetDialog().nativeElement.close();
  }

  protected onResetDialogClose(): void {
    this.resetForm.set({ name: '', price: null, date: todayIso() });
  }

  protected onDialogBackdropClick(event: MouseEvent, dialog: HTMLDialogElement): void {
    if (event.target === dialog) {
      dialog.close();
    }
  }

  protected onDialogKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      (event.currentTarget as HTMLDialogElement | null)?.close();
    }
  }

  protected openWithdrawModal(): void {
    const acc = this.selectedAccount();
    if (!acc || acc.type !== 'LIVE' || acc.status !== 'ACTIVE') {
      return;
    }
    this.withdrawForm.set({ name: acc.name, amount: null, date: todayIso() });
    this.closeActionModal();
    this.withdrawDialog().nativeElement.showModal();
  }

  protected closeWithdrawModal(): void {
    this.withdrawDialog().nativeElement.close();
  }

  protected onWithdrawDialogClose(): void {
    this.withdrawForm.set({ name: '', amount: null, date: todayIso() });
  }

  protected onWithdrawAmountChange(value: string): void {
    const n = value === '' ? null : Number(value);
    this.withdrawForm.update(f => ({
      ...f,
      amount: n !== null && Number.isFinite(n) && n > 0 ? n : null,
    }));
  }

  protected onWithdrawDateChange(value: string): void {
    this.withdrawForm.update(f => ({ ...f, date: value }));
  }

  protected async confirmWithdraw(): Promise<void> {
    const acc = this.selectedAccount();
    const form = this.withdrawForm();
    if (!acc || form.amount === null || form.amount <= 0 || !form.date) {
      return;
    }
    const dto: WithdrawTrackerAccountDto = { amount: form.amount, date: form.date };
    try {
      const updated = await this.api.post<TrackerAccount>(
        `tracker-accounts/${acc.id}/withdraw`,
        dto,
      );
      this.replaceInList(updated);
      this.selectedAccount.set(null);
      this.closeWithdrawModal();
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  protected async confirmReset(): Promise<void> {
    const acc = this.selectedAccount();
    const form = this.resetForm();
    if (!acc || form.price === null || form.price <= 0 || !form.date) {
      return;
    }
    const dto: ResetTrackerAccountDto = { price: form.price, date: form.date };
    try {
      const updated = await this.api.post<TrackerAccount>(`tracker-accounts/${acc.id}/reset`, dto);
      this.replaceInList(updated);
      this.selectedAccount.set(null);
      this.closeResetModal();
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  protected suspendAccount(): void {
    void this.changeStatus('SUSPENDED');
  }

  protected async passEvaluation(): Promise<void> {
    const acc = this.selectedAccount();
    if (!acc || acc.status !== 'ACTIVE' || acc.type !== 'EVALUATION') {
      return;
    }
    try {
      const updated = await this.api.patch<TrackerAccount>(
        `tracker-accounts/${acc.id}/status`,
        { status: 'SUSPENDED' } satisfies UpdateTrackerAccountStatusDto,
      );
      this.replaceInList(updated);
      this.closeActionModal();
      this.openCreateModal();
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  protected async deleteAccount(): Promise<void> {
    const acc = this.selectedAccount();
    if (!acc) {
      return;
    }
    // El <dialog> nativo vive en el top layer y taparía el confirm; se cierra antes de preguntar.
    this.closeActionModal();
    const confirmed = await this.confirm.ask({
      title: 'Eliminar cuenta',
      message: `¿Eliminar la cuenta ${acc.name}?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.api.delete<void>(`tracker-accounts/${acc.id}`);
      this.accounts.update(list => list.filter(a => a.id !== acc.id));
      this.selectedAccount.set(null);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  protected openCreateModal(): void {
    this.createForm.set({ ...EMPTY_CREATE_FORM });
    this.createError.set(null);
    this.createDialog().nativeElement.showModal();
  }

  protected closeCreateModal(): void {
    this.createDialog().nativeElement.close();
  }

  protected onCreateDialogClose(): void {
    this.createForm.set({ ...EMPTY_CREATE_FORM });
    this.createError.set(null);
  }

  protected onCreateFieldChange(field: CreateTextField, value: string): void {
    this.createForm.update(f => ({ ...f, [field]: this.coerceCreateText(field, value) }));
  }

  protected onCreateNumberChange(field: CreateNumberField, value: string): void {
    const n = value === '' ? null : Number(value);
    const safe = n !== null && Number.isFinite(n) && n >= 0 ? n : null;
    this.createForm.update(f => ({ ...f, [field]: safe }));
  }

  protected async confirmCreate(): Promise<void> {
    if (!this.isCreateFormValid() || this.creating()) {
      return;
    }
    const form = this.createForm();
    const dto: CreateTrackerAccountDto = {
      name: form.name.trim(),
      type: form.type,
      status: form.status,
      company: form.company.trim(),
      totalExpenses: form.totalExpenses ?? 0,
      totalProfits: form.totalProfits ?? 0,
    };
    this.creating.set(true);
    this.createError.set(null);
    try {
      const created = await this.api.post<TrackerAccount>('tracker-accounts', dto);
      this.accounts.update(list => [...list, created]);
      this.closeCreateModal();
    } catch (e) {
      this.createError.set(ApiClient.messageFromError(e));
    } finally {
      this.creating.set(false);
    }
  }

  private coerceCreateText(field: CreateTextField, value: string): string {
    if (field === 'type') {
      return value === 'LIVE' ? 'LIVE' : 'EVALUATION';
    }
    if (field === 'status') {
      return value === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
    }
    return value;
  }

  protected onTypeChange(value: string): void {
    this.selectedType.set(value === 'EVALUATION' || value === 'LIVE' ? value : '');
  }

  protected onStatusChange(value: string): void {
    this.selectedStatus.set(value === 'ACTIVE' || value === 'SUSPENDED' ? value : '');
  }

  protected onResetPriceChange(value: string): void {
    const n = value === '' ? null : Number(value);
    this.resetForm.update(f => ({ ...f, price: n !== null && Number.isFinite(n) ? n : null }));
  }

  protected onResetDateChange(value: string): void {
    this.resetForm.update(f => ({ ...f, date: value }));
  }

  private async changeStatus(status: TrackerAccountStatus): Promise<void> {
    const acc = this.selectedAccount();
    if (!acc) {
      return;
    }
    const dto: UpdateTrackerAccountStatusDto = { status };
    try {
      const updated = await this.api.patch<TrackerAccount>(
        `tracker-accounts/${acc.id}/status`,
        dto,
      );
      this.replaceInList(updated);
      this.closeActionModal();
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  private replaceInList(updated: TrackerAccount): void {
    this.accounts.update(list => list.map(a => (a.id === updated.id ? updated : a)));
    if (this.selectedAccount()?.id === updated.id) {
      this.selectedAccount.set(updated);
    }
  }
}
