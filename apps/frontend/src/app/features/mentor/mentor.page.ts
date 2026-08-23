import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { LucideAngularModule, Sparkles } from 'lucide-angular';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { ConfirmService } from '../../core/confirm/confirm.service';
import { InsightsStore } from '../dashboard/insights.store';
import { ErrorBannerComponent } from '../../shared/ui/error-banner.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { SubmitButtonComponent } from '../../shared/ui/submit-button.component';
import { MonthPickerComponent, type IMonthSelection } from '../../shared/ui/month-picker.component';
import { formatUsd } from '../../shared/format';
import { MentorDigestComponent } from './mentor-digest.component';
import { MentorEliminateComponent } from './mentor-eliminate.component';
import { MentorHistoryComponent } from './mentor-history.component';
import { MentorLeaksComponent } from './mentor-leaks.component';
import { MentorVerdictComponent } from './mentor-verdict.component';
import { MentorStore, type IMentorPeriod } from './mentor.store';

const consentMessage =
  'Para generar el análisis se enviarán al proveedor de IA los datos del periodo, incluidas las notas de tus trades y del notebook. El digest completo queda guardado en el historial. ¿Continuar?';

/**
 * Mentor Mode: el digest determinista con una nota del coach encima. La
 * generación nunca es automática, sólo el clic la dispara.
 * @class
 */
@Component({
  selector: 'app-mentor-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideAngularModule,
    ErrorBannerComponent,
    SkeletonComponent,
    SubmitButtonComponent,
    MonthPickerComponent,
    MentorVerdictComponent,
    MentorEliminateComponent,
    MentorLeaksComponent,
    MentorDigestComponent,
    MentorHistoryComponent,
  ],
  templateUrl: './mentor.page.html',
  styleUrl: './mentor.page.scss',
})
export class MentorPage implements OnInit {
  protected readonly iconSparkles = Sparkles;
  protected readonly formatUsd = formatUsd;

  private readonly store = inject(MentorStore);
  private readonly accounts = inject(AccountsStore);
  private readonly insights = inject(InsightsStore);
  private readonly confirm = inject(ConfirmService);

  protected readonly year = signal<number | null>(new Date().getFullYear());
  protected readonly month = signal<number | null>(new Date().getMonth() + 1);

  protected readonly monthKeys = this.insights.availableMonths;
  protected readonly status = this.store.status;
  protected readonly digest = this.store.activeDigest;
  protected readonly advice = this.store.advice;
  protected readonly report = this.store.report;
  protected readonly history = this.store.history;
  protected readonly loading = this.store.loading;
  protected readonly generating = this.store.generating;
  protected readonly error = this.store.error;
  protected readonly blocked = this.store.blocked;

  protected readonly overall = computed(() => this.digest()?.overall ?? null);
  protected readonly periodLabel = computed(() => this.digest()?.period.label ?? '—');
  protected readonly activeReportId = computed(() => this.report()?.id ?? null);

  /** Mezclar una evaluación de prop firm con una cuenta real da consejos poco accionables. */
  protected readonly allAccountsWarning = computed(
    () => this.accounts.selectedId() === 'ALL' && this.accounts.accounts().length > 1,
  );

  protected readonly mixedCurrencies = computed(() => this.digest()?.mixedCurrencies ?? false);

  protected readonly canGenerate = computed(
    () => !this.generating() && !this.mixedCurrencies() && (this.overall()?.trades ?? 0) > 0,
  );

  protected readonly importedWarning = computed(() => {
    const mix = this.digest()?.sourceMix;
    return mix && mix.importedPct > 0 ? mix : null;
  });

  constructor() {
    // Recarga el digest y limpia el informe al cambiar de cuenta o de periodo.
    // Nunca dispara una generación: eso cuesta dinero y sólo lo hace el botón.
    effect(() => {
      this.accounts.selectedId();
      const period = this.period();
      this.store.clearReport();
      void this.store.loadDigest(period);
    });
  }

  ngOnInit(): void {
    void this.bootstrap();
  }

  protected onPeriodChange(selection: IMonthSelection): void {
    this.year.set(selection.year);
    this.month.set(selection.month);
  }

  /**
   * Genera el análisis. Pide consentimiento la primera vez y confirmación si ya
   * existe un informe de ese periodo.
   * @returns {Promise<void>}
   */
  protected async onGenerate(): Promise<void> {
    if (!(await this.ensureConsent())) {
      return;
    }
    if (!(await this.confirmRegenerate())) {
      return;
    }
    await this.store.generate(this.period());
  }

  protected async onRemove(id: string): Promise<void> {
    const confirmed = await this.confirm.ask({
      message: 'Se eliminará este informe del historial.',
      title: 'Eliminar informe',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (confirmed) {
      await this.store.remove(id);
    }
  }

  protected onOpen(id: string): void {
    void this.store.openReport(id);
  }

  private async bootstrap(): Promise<void> {
    await this.accounts.load();
    await Promise.all([this.insights.loadAvailableMonths(), this.store.loadStatus()]);
  }

  private period(): IMentorPeriod {
    return { year: this.year(), month: this.month() };
  }

  private async ensureConsent(): Promise<boolean> {
    if (this.store.consent()) {
      return true;
    }
    const accepted = await this.confirm.ask({
      message: consentMessage,
      title: 'Enviar tus notas al proveedor de IA',
      confirmLabel: 'Aceptar y generar',
    });
    if (accepted) {
      this.store.acceptConsent();
    }
    return accepted;
  }

  private async confirmRegenerate(): Promise<boolean> {
    const digest = this.digest();
    if (!digest || !this.store.hasReportFor(digest.period.label, digest.accountLabel)) {
      return true;
    }
    return this.confirm.ask({
      message: `Ya existe un informe de ${digest.period.label}. Si los datos no cambiaron se reutiliza sin coste; si cambiaron, se generará uno nuevo.`,
      title: 'Regenerar análisis',
      confirmLabel: 'Generar',
    });
  }
}
