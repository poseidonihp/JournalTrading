import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogRef } from '@angular/cdk/dialog';
import { LucideAngularModule, Upload, CheckCircle, AlertCircle } from 'lucide-angular';
import type { ImportResult } from '@journal/shared-types';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { ApiClient } from '../../core/http/api.client';
import { TradesStore } from '../trades/trades.store';
import { DialogComponent } from '../../shared/ui/dialog.component';
import { FieldComponent } from '../../shared/ui/field.component';
import { ErrorBannerComponent } from '../../shared/ui/error-banner.component';
import { SubmitButtonComponent } from '../../shared/ui/submit-button.component';

@Component({
  selector: 'app-import-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideAngularModule,
    FormsModule,
    DialogComponent,
    FieldComponent,
    ErrorBannerComponent,
    SubmitButtonComponent,
  ],
  template: `
    <journal-dialog
      title="Importar CSV"
      subtitle="NinjaTrader"
      widthClass="w-[640px] max-w-[95vw]"
      (closed)="close()"
    >
      <div dialog-body class="flex-1 overflow-y-auto p-5 space-y-4">
        <journal-field label="Cuenta destino">
          <select
            [ngModel]="accountId()"
            (ngModelChange)="accountId.set($event)"
            class="w-full px-3 py-2 rounded border text-sm"
            style="background: var(--qp-bg-soft); border-color: var(--qp-line);"
          >
            <option value="">— Selecciona —</option>
            @for (a of accounts.accounts(); track a.id) {
              <option [value]="a.id">{{ a.name }} ({{ a.broker || a.currency }})</option>
            }
          </select>
        </journal-field>

        <journal-field label="Archivo CSV">
          <input
            type="file"
            accept=".csv,text/csv"
            (change)="onFileChange($any($event.target).files)"
            class="block w-full text-sm"
          />
          @if (file(); as f) {
            <div class="text-[11px] mt-1" style="color: var(--qp-mute-2);">
              {{ f.name }} · {{ (f.size / 1024).toFixed(1) }} KB
            </div>
          }
        </journal-field>

        <div
          class="text-[12px] leading-relaxed rounded p-3"
          style="background: var(--qp-bg-soft); color: var(--qp-mute);"
        >
          Esperamos un export "Trade Performance" de NinjaTrader con columnas:
          <code
            >Instrument, Market pos., Qty, Entry price, Exit price, Entry time, Exit time, Profit,
            Commission, Trade number</code
          >. Los trades se vincularán con los instrumentos sembrados (MES, MNQ, CFD). Filas con
          instrumento desconocido se reportan como omitidas.
        </div>

        @if (result(); as r) {
          <div class="space-y-3">
            <div class="flex items-center gap-2 text-sm">
              @if (r.batch.status === 'SUCCESS') {
                <lucide-icon
                  [name]="iconOk"
                  class="h-4 w-4"
                  style="color: var(--qp-positive);"
                ></lucide-icon>
                <span>Importación completa</span>
              } @else if (r.batch.status === 'PARTIAL') {
                <lucide-icon
                  [name]="iconWarn"
                  class="h-4 w-4"
                  style="color: var(--qp-clay);"
                ></lucide-icon>
                <span>Importación parcial</span>
              } @else {
                <lucide-icon
                  [name]="iconWarn"
                  class="h-4 w-4"
                  style="color: var(--qp-clay);"
                ></lucide-icon>
                <span>Importación fallida</span>
              }
            </div>
            <div class="grid grid-cols-3 gap-2 text-center text-xs">
              <div class="rounded py-2" style="background: var(--qp-bg-soft);">
                <div class="serif text-[20px]">{{ r.batch.totalRows }}</div>
                <div style="color: var(--qp-mute-2);">Filas</div>
              </div>
              <div class="rounded py-2" style="background: var(--qp-bg-soft);">
                <div class="serif text-[20px]" style="color: var(--qp-positive);">
                  {{ r.batch.importedCount }}
                </div>
                <div style="color: var(--qp-mute-2);">Importadas</div>
              </div>
              <div class="rounded py-2" style="background: var(--qp-bg-soft);">
                <div class="serif text-[20px]" style="color: var(--qp-clay);">
                  {{ r.batch.skippedCount }}
                </div>
                <div style="color: var(--qp-mute-2);">Omitidas</div>
              </div>
            </div>
            @if (r.errors.length > 0) {
              <details>
                <summary class="text-xs cursor-pointer" style="color: var(--qp-mute);">
                  Ver {{ r.errors.length }} errores
                </summary>
                <ul class="text-[11px] mt-2 space-y-1 max-h-32 overflow-y-auto">
                  @for (err of r.errors; track $index) {
                    <li style="color: var(--qp-clay);">Fila {{ err.row }}: {{ err.message }}</li>
                  }
                </ul>
              </details>
            }
          </div>
        }

        <journal-error-banner [message]="errorMessage()" />
      </div>

      <div dialog-footer class="contents">
        <button type="button" class="pill" (click)="close()">Cerrar</button>
        <journal-submit-button
          type="button"
          (clicked)="submit()"
          [loading]="uploading()"
          [disabled]="!canSubmit()"
          [icon]="iconUpload"
          label="Importar"
          loadingLabel="Importando…"
        />
      </div>
    </journal-dialog>
  `,
})
export class ImportDialogComponent {
  protected readonly iconUpload = Upload;
  protected readonly iconOk = CheckCircle;
  protected readonly iconWarn = AlertCircle;

  protected readonly accounts = inject(AccountsStore);
  private readonly api = inject(ApiClient);
  private readonly trades = inject(TradesStore);
  private readonly ref = inject(DialogRef);

  protected readonly accountId = signal<string>(this.initialAccount());
  protected readonly file = signal<File | null>(null);
  protected readonly uploading = signal<boolean>(false);
  protected readonly result = signal<ImportResult | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected onFileChange(files: FileList | null): void {
    this.file.set(files && files.length > 0 ? files[0] : null);
    this.result.set(null);
    this.errorMessage.set(null);
  }

  protected canSubmit(): boolean {
    return !!this.accountId() && !!this.file();
  }

  protected async submit(): Promise<void> {
    const f = this.file();
    const acc = this.accountId();
    if (!f || !acc) return;
    this.uploading.set(true);
    this.errorMessage.set(null);
    try {
      const form = new FormData();
      form.append('file', f, f.name);
      const res = await this.api.postForm<ImportResult>(
        `imports/ninjatrader?accountId=${encodeURIComponent(acc)}`,
        form,
      );
      this.result.set(res);
      if (res.batch.importedCount > 0) {
        await this.trades.load();
      }
    } catch (e) {
      this.errorMessage.set(ApiClient.messageFromError(e));
    } finally {
      this.uploading.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }

  private initialAccount(): string {
    const sel = this.accounts.selectedId();
    return sel && sel !== 'ALL' ? sel : '';
  }
}
