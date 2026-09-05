import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { LucideAngularModule, Trash2, Image as ImageIcon } from 'lucide-angular';
import {
  EmotionEnum,
  ExitReasonEnum,
  TradeDirectionEnum,
  enumLabels,
  type CreateTradeDto,
  type Emotion,
  type ExitReason,
  type Trade,
  type TradeDirection,
} from '@journal/shared-types';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { InstrumentsStore } from '../../core/instruments/instruments.store';
import { TradeTypesStore } from '../../core/trade-types/trade-types.store';
import { ApiClient } from '../../core/http/api.client';
import { TradesStore } from './trades.store';
import { formatUsd } from '../../shared/format';
import { DialogComponent } from '../../shared/ui/dialog.component';
import { FieldComponent } from '../../shared/ui/field.component';
import { ErrorBannerComponent } from '../../shared/ui/error-banner.component';
import { SubmitButtonComponent } from '../../shared/ui/submit-button.component';

export interface TradeFormDialogData {
  trade?: Trade;
}

/** Nombre de archivo con extensión: `captura.png`. Anclado al final y sin cuantificadores anidados. */
const extensionPattern = /\.[a-z0-9]+$/i;

interface PendingFile {
  file: File;
  previewUrl: string;
  kind: 'IMAGE' | 'VIDEO';
}

@Component({
  selector: 'app-trade-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    LucideAngularModule,
    CdkDrag,
    CdkDropList,
    DialogComponent,
    FieldComponent,
    ErrorBannerComponent,
    SubmitButtonComponent,
  ],
  templateUrl: './trade-form-dialog.component.html',
  styleUrl: './trade-form-dialog.component.scss',
  host: { '(document:paste)': 'onPaste($event)' },
})
export class TradeFormDialogComponent implements OnInit {
  protected readonly iconTrash = Trash2;
  protected readonly iconImage = ImageIcon;
  protected readonly formatUsd = formatUsd;

  protected readonly directions = TradeDirectionEnum.options;
  protected readonly emotions = EmotionEnum.options;
  protected readonly exitReasons = ExitReasonEnum.options;

  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject<DialogRef<Trade | null, TradeFormDialogComponent>>(DialogRef);
  private readonly data = inject<TradeFormDialogData>(DIALOG_DATA);
  protected readonly accountsStore = inject(AccountsStore);
  protected readonly instrumentsStore = inject(InstrumentsStore);
  protected readonly tradeTypesStore = inject(TradeTypesStore);
  private readonly trades = inject(TradesStore);

  protected readonly isEdit = !!this.data.trade;
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly pending = signal<PendingFile[]>([]);
  protected readonly existingMedia = signal<Trade['media']>(this.data.trade?.media ?? []);
  protected readonly netOverrideEnabled = signal<boolean>(false);
  private readonly removedMediaIds = new Set<string>();

  protected readonly selectableAccounts = computed(() => {
    const active = this.accountsStore.activeAccounts();
    const currentId = this.data.trade?.accountId;
    if (!currentId || active.some((a) => a.id === currentId)) {
      return active;
    }
    const current = this.accountsStore.accounts().find((a) => a.id === currentId);
    return current ? [...active, current] : active;
  });

  protected readonly form = this.fb.group(
    {
      accountId: this.fb.nonNullable.control('', Validators.required),
      instrumentId: this.fb.nonNullable.control('', Validators.required),
      enteredAt: this.fb.nonNullable.control('', Validators.required),
      exitedAt: this.fb.nonNullable.control('', Validators.required),
      contracts: this.fb.nonNullable.control(1, [Validators.required, Validators.min(1)]),
      direction: this.fb.nonNullable.control<TradeDirection>(TradeDirectionEnum.options[0]),
      tradeTypeId: this.fb.nonNullable.control('', Validators.required),
      exitReason: this.fb.nonNullable.control<ExitReason>(ExitReasonEnum.options[0]),
      emotion: this.fb.nonNullable.control<Emotion>(EmotionEnum.options[0]),
      pointsTotal: this.fb.nonNullable.control(0),
      entryPrice: new FormControl<number | null>(null),
      exitPrice: new FormControl<number | null>(null),
      plannedStop: new FormControl<number | null>(null),
      plannedTarget: new FormControl<number | null>(null),
      mae: new FormControl<number | null>(null),
      mfe: new FormControl<number | null>(null),
      commission: new FormControl<number | null>(null),
      netOverride: new FormControl<number | null>(null),
      entryReason: this.fb.nonNullable.control(''),
      notes: this.fb.nonNullable.control(''),
    },
    { validators: TradeFormDialogComponent._exitAfterEntryValidator },
  );

  protected readonly enteredAtValue = signal<string>('');
  protected readonly exitBeforeEntry = signal<boolean>(false);

  protected readonly defaultCommission = computed(() => {
    const instId = this.form.controls.instrumentId.value;
    const inst = this.instrumentsStore.list().find((i) => i.id === instId);
    const contracts = this.form.controls.contracts.value;
    if (!inst || !contracts) return 'Auto';
    const per = Number(inst.defaultCommissionPerContract);
    return formatUsd(per * contracts);
  });

  protected readonly calcGross = computed(() => {
    const instId = this.formValue().instrumentId;
    const inst = this.instrumentsStore.list().find((i) => i.id === instId);
    if (!inst) return 0;
    const pv = Number(inst.pointValue);
    return Number(this.formValue().pointsTotal) * pv * Number(this.formValue().contracts);
  });

  protected readonly calcCommission = computed(() => {
    const explicit = this.formValue().commission;
    if (explicit !== null && explicit !== undefined && !Number.isNaN(Number(explicit))) {
      return Number(explicit);
    }
    const instId = this.formValue().instrumentId;
    const inst = this.instrumentsStore.list().find((i) => i.id === instId);
    if (!inst) return 0;
    return Number(inst.defaultCommissionPerContract) * Number(this.formValue().contracts);
  });

  protected readonly calcNet = computed(() => {
    if (this.netOverrideEnabled()) {
      const v = this.formValue().netOverride;
      return v !== null && v !== undefined ? Number(v) : 0;
    }
    return this.calcGross() - this.calcCommission();
  });

  protected readonly netClass = computed(() => {
    const n = this.calcNet();
    if (n === 0) return 'text-fg-muted';
    return n > 0 ? 'text-success' : 'text-danger';
  });

  protected readonly absNet = computed(() => Math.abs(this.calcNet()));

  private readonly formValue = signal(this.form.getRawValue());

  protected readonly selectedTradeTypeColor = computed(() => {
    const id = this.formValue().tradeTypeId;
    return this.tradeTypesStore.types().find((t) => t.id === id)?.color ?? 'transparent';
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.formValue.set(this.form.getRawValue());
      this.exitBeforeEntry.set(this.form.errors?.['exitBeforeEntry'] === true);
    });

    this.form.controls.enteredAt.valueChanges.pipe(takeUntilDestroyed()).subscribe((entered) => {
      this.enteredAtValue.set(entered ?? '');
      if (entered) {
        this.form.controls.exitedAt.setValue(entered);
      }
    });

    effect((onCleanup) => {
      const list = this.pending();
      onCleanup(() => {
        for (const p of list) URL.revokeObjectURL(p.previewUrl);
      });
    });

    this._initializeForm();
    this.enteredAtValue.set(this.form.controls.enteredAt.value);

    // Al seleccionar instrumento o cambiar el nº de contratos, recalcula la comisión configurada
    // (por contrato × nº de contratos). Se suscribe después de _initializeForm para no pisar la
    // comisión de un trade existente al editar.
    this.form.controls.instrumentId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this._fillCommissionFromInstrument());
    this.form.controls.contracts.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this._fillCommissionFromInstrument());
  }

  ngOnInit(): void {
    void this._loadCatalogs();
  }

  /**
   * El diálogo se abre desde cualquier pantalla (botón global "Nuevo trade"), así que los
   * catálogos de instrumentos y tipos de trade pueden no estar cargados todavía. Se cargan al
   * abrir y, cuando llegan, se aplican los predeterminados que `_initializeForm` no pudo poner.
   * @private
   * @returns {Promise<void>}
   */
  private async _loadCatalogs(): Promise<void> {
    try {
      await Promise.all([this.instrumentsStore.load(), this.tradeTypesStore.load()]);
    } catch (e) {
      this.errorMessage.set(ApiClient.messageFromError(e));
      return;
    }
    this._applyCatalogDefaults();
  }

  /**
   * Selecciona el primer instrumento y tipo de trade disponibles cuando el formulario es nuevo y
   * esos campos quedaron vacíos porque los catálogos aún no habían cargado.
   * @private
   * @returns {void}
   */
  private _applyCatalogDefaults(): void {
    if (this.isEdit) {
      return;
    }
    const instrument = this.form.controls.instrumentId;
    if (!instrument.value) {
      instrument.setValue(this.instrumentsStore.list()[0]?.id ?? '', { emitEvent: false });
    }
    const tradeType = this.form.controls.tradeTypeId;
    if (!tradeType.value) {
      tradeType.setValue(this.tradeTypesStore.types()[0]?.id ?? '', { emitEvent: false });
    }
    this.formValue.set(this.form.getRawValue());
  }

  private _fillCommissionFromInstrument(): void {
    const instId = this.form.controls.instrumentId.value;
    const inst = this.instrumentsStore.list().find((i) => i.id === instId);
    const contracts = Number(this.form.controls.contracts.value);
    if (!inst || !contracts) {
      return;
    }
    const per = Number(inst.defaultCommissionPerContract);
    this.form.controls.commission.setValue(Number((per * contracts).toFixed(4)));
  }

  private _initializeForm(): void {
    const trade = this.data.trade;
    if (trade) {
      this.form.patchValue({
        accountId: trade.accountId,
        instrumentId: trade.instrumentId,
        enteredAt: TradeFormDialogComponent._toLocalInput(trade.enteredAt),
        exitedAt: TradeFormDialogComponent._toLocalInput(trade.exitedAt),
        contracts: trade.contracts,
        direction: trade.direction,
        tradeTypeId: trade.tradeTypeId,
        exitReason: trade.exitReason,
        emotion: trade.emotion,
        pointsTotal: Number(trade.pointsTotal),
        entryPrice: TradeFormDialogComponent._toNumberOrNull(trade.entryPrice),
        exitPrice: TradeFormDialogComponent._toNumberOrNull(trade.exitPrice),
        plannedStop: TradeFormDialogComponent._toNumberOrNull(trade.plannedStop),
        plannedTarget: TradeFormDialogComponent._toNumberOrNull(trade.plannedTarget),
        mae: TradeFormDialogComponent._toNumberOrNull(trade.mae),
        mfe: TradeFormDialogComponent._toNumberOrNull(trade.mfe),
        commission: Number(trade.commission),
        entryReason: trade.entryReason ?? '',
        notes: trade.notes ?? '',
      });
    } else {
      const selectedAccountId = this.accountsStore.selectedId();
      const accountId =
        selectedAccountId && selectedAccountId !== 'ALL'
          ? selectedAccountId
          : (this.accountsStore.accounts()[0]?.id ?? '');
      const instrumentId = this.instrumentsStore.list()[0]?.id ?? '';
      const tradeTypeId = this.tradeTypesStore.types()[0]?.id ?? '';
      const nowLocal = TradeFormDialogComponent._nowAsLocalInput();
      this.form.patchValue({
        accountId,
        instrumentId,
        tradeTypeId,
        enteredAt: nowLocal,
        exitedAt: nowLocal,
      });
    }
  }

  labelDirection(d: (typeof TradeDirectionEnum.options)[number]): string {
    return enumLabels.direction[d];
  }

  labelEmotion(e: (typeof EmotionEnum.options)[number]): string {
    return enumLabels.emotion[e];
  }

  labelExit(r: (typeof ExitReasonEnum.options)[number]): string {
    return enumLabels.exitReason[r];
  }

  toggleNetOverride(): void {
    this.netOverrideEnabled.update((v) => !v);
    if (!this.netOverrideEnabled()) {
      this.form.controls.netOverride.setValue(null);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);
    this._addFiles(files);
  }

  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) {
      return;
    }
    this._addFiles(Array.from(input.files));
    input.value = '';
  }

  /**
   * Añade como adjunto pendiente la imagen o el video que venga en el portapapeles
   * (Ctrl+V), sirviendo tanto para un recorte de pantalla como para un archivo copiado.
   * El pegado de texto se ignora para no interferir con los textareas del formulario.
   */
  onPaste(event: ClipboardEvent): void {
    const clipboardFiles = Array.from(event.clipboardData?.items ?? [])
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null && TradeFormDialogComponent._isMedia(file))
      .map(file => TradeFormDialogComponent._withUploadName(file));
    if (clipboardFiles.length === 0) {
      return;
    }
    event.preventDefault();
    this._addFiles(clipboardFiles);
  }

  onDropFiles(_evt: unknown): void {
    // Reservado para reorden vía cdkDropList — sin reordenar por ahora.
  }

  removeExisting(id: string): void {
    this.removedMediaIds.add(id);
    this.existingMedia.update((curr) => curr.filter((m) => m.id !== id));
  }

  removePending(previewUrl: string): void {
    this.pending.update((curr) => {
      const next = curr.filter((p) => p.previewUrl !== previewUrl);
      const removed = curr.find((p) => p.previewUrl === previewUrl);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return next;
    });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const missing = Object.entries(this.form.controls)
        .filter(([, c]) => c.invalid)
        .map(([k]) => k);
      this.errorMessage.set(`Faltan o son inválidos: ${missing.join(', ')}`);
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const dto = this._buildDto();
      const missing = TradeFormDialogComponent._findMissing(dto);
      if (missing.length > 0) {
        throw new Error(`Datos incompletos: ${missing.join(', ')}`);
      }
      let trade: Trade;
      if (this.data.trade) {
        trade = await this.trades.update(this.data.trade.id, dto);
        for (const id of this.removedMediaIds) {
          await this.trades.deleteMedia(trade.id, id);
        }
      } else {
        trade = await this.trades.create(dto);
      }

      const pendingFiles = this.pending().map((p) => p.file);
      if (pendingFiles.length > 0) {
        await this.trades.uploadMedia(trade.id, pendingFiles);
      }
      this.dialogRef.close(trade);
    } catch (e) {
      this.errorMessage.set(ApiClient.messageFromError(e));
    } finally {
      this.submitting.set(false);
    }
  }

  private _addFiles(files: File[]): void {
    if (files.length === 0) {
      return;
    }
    const next: PendingFile[] = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      kind: file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE',
    }));
    this.pending.update((curr) => [...curr, ...next]);
  }

  private _buildDto(): CreateTradeDto {
    const v = this.form.getRawValue();
    const dto: CreateTradeDto = {
      accountId: v.accountId,
      instrumentId: v.instrumentId,
      enteredAt: TradeFormDialogComponent._fromLocalInput(v.enteredAt),
      exitedAt: TradeFormDialogComponent._fromLocalInput(v.exitedAt),
      contracts: Number(v.contracts),
      direction: v.direction,
      tradeTypeId: v.tradeTypeId,
      exitReason: v.exitReason,
      emotion: v.emotion,
      pointsTotal: String(v.pointsTotal),
      entryPrice: TradeFormDialogComponent._toDecimalOrNull(v.entryPrice),
      exitPrice: TradeFormDialogComponent._toDecimalOrNull(v.exitPrice),
      plannedStop: TradeFormDialogComponent._toDecimalOrNull(v.plannedStop),
      plannedTarget: TradeFormDialogComponent._toDecimalOrNull(v.plannedTarget),
      mae: TradeFormDialogComponent._toDecimalOrNull(v.mae),
      mfe: TradeFormDialogComponent._toDecimalOrNull(v.mfe),
      commission:
        v.commission !== null && v.commission !== undefined ? String(v.commission) : undefined,
      netOverride:
        this.netOverrideEnabled() && v.netOverride !== null ? String(v.netOverride) : null,
      entryReason: v.entryReason ? v.entryReason : null,
      notes: v.notes ? v.notes : null,
    };
    return dto;
  }

  private static _findMissing(dto: CreateTradeDto): string[] {
    const required: (keyof CreateTradeDto)[] = [
      'accountId',
      'instrumentId',
      'enteredAt',
      'exitedAt',
      'contracts',
      'direction',
      'tradeTypeId',
      'exitReason',
      'emotion',
      'pointsTotal',
    ];
    return required.filter((k) => {
      const v = dto[k];
      return v === null || v === undefined || v === '';
    });
  }

  /**
   * Convierte un decimal del DTO al número que espera el input.
   * @param value - Decimal como string, o null si el trade no lo tiene
   * @returns {number | null}
   */
  private static _toNumberOrNull(value: string | null): number | null {
    return value === null ? null : Number(value);
  }

  /**
   * Convierte el valor de un input numérico opcional al decimal del DTO.
   * @param value - Número del formulario; null cuando el campo quedó vacío
   * @returns {string | null}
   */
  private static _toDecimalOrNull(value: number | null): string | null {
    return value === null || Number.isNaN(value) ? null : String(value);
  }

  private static _isMedia(file: File): boolean {
    return file.type.startsWith('image/') || file.type.startsWith('video/');
  }

  /**
   * Los archivos del portapapeles pueden llegar sin nombre o sin extensión; el backend deriva
   * la extensión del MIME solo si el nombre no la trae, y la necesita para servir el adjunto
   * con el Content-Type correcto (helmet activa `nosniff`).
   */
  private static _withUploadName(file: File): File {
    if (extensionPattern.test(file.name)) {
      return file;
    }
    const subtype = file.type.split('/')[1] ?? '';
    const ext = subtype.split('+')[0]?.replace(/[^a-z0-9]/gi, '') ?? '';
    return new File([file], ext ? `pegado.${ext}` : 'pegado', { type: file.type });
  }

  private static _exitAfterEntryValidator(control: AbstractControl): ValidationErrors | null {
    const entered = control.get('enteredAt')?.value as string | undefined;
    const exited = control.get('exitedAt')?.value as string | undefined;
    if (!entered || !exited) {
      return null;
    }
    return exited < entered ? { exitBeforeEntry: true } : null;
  }

  private static _toLocalInput(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number): string => n.toString().padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }

  private static _fromLocalInput(local: string): string {
    return `${local}:00.000Z`;
  }

  private static _nowAsLocalInput(): string {
    const d = new Date();
    const pad = (n: number): string => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
