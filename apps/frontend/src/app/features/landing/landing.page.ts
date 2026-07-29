import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Layers,
  LucideAngularModule,
  Moon,
  NotebookPen,
  Sun,
  TrendingUp,
  Wallet,
  type LucideIconData,
} from 'lucide-angular';
import { ThemeService } from '../../core/theme/theme.service';

/** Tarjeta de la tira de secciones de la landing. */
interface ILandingFeature {
  icon: LucideIconData;
  title: string;
  description: string;
}

/**
 * Pantalla de inicio pública: hero animado, resumen de lo que incluye el journal y
 * acceso al login. Se renderiza fuera del shell y sin sesión, por lo que pinta su
 * propio fondo. Las animaciones son CSS puro (la app es zoneless y no hay librería
 * de animación); el reveal al scroll usa IntersectionObserver manipulando el DOM
 * directamente para no disparar change detection.
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LucideAngularModule],
  templateUrl: './landing.page.html',
  styleUrl: './landing.page.scss',
})
export class LandingPage {
  protected readonly theme = inject(ThemeService);

  protected readonly iconArrowRight = ArrowRight;
  protected readonly iconSun = Sun;
  protected readonly iconMoon = Moon;

  protected readonly features: readonly ILandingFeature[] = [
    {
      icon: Activity,
      title: 'Trades',
      description:
        'Registra cada operación: entradas, salidas, R múltiplo, comisiones, capturas y notas.',
    },
    {
      icon: CalendarDays,
      title: 'Dashboard',
      description: 'KPIs del periodo, calendario de P&L diario y curva de equity.',
    },
    {
      icon: TrendingUp,
      title: 'Reportes',
      description: 'Rendimiento por día, por hora y por instrumento, más análisis de drawdown.',
    },
    {
      icon: NotebookPen,
      title: 'Notebook',
      description: 'Diario por sesión: qué viste, qué hiciste y qué corregir mañana.',
    },
    {
      icon: Wallet,
      title: 'Cuentas y capital',
      description: 'Multi-cuenta con depósitos, retiros e historial de movimientos.',
    },
    {
      icon: Layers,
      title: 'Instrumentos y tipos',
      description: 'Tu propio catálogo de futuros y tus tipos de setup.',
    },
  ];

  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _featuresSection = viewChild<ElementRef<HTMLElement>>('featuresSection');
  private readonly _revealThreshold = 0.15;

  /**
   * Inicializa la landing: marca el host como animable y arranca el observer de reveal.
   * @constructor
   */
  constructor() {
    this._host.nativeElement.classList.add('landing-js');

    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = this._observeReveals();
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /**
   * Desplaza la vista hasta la tira de secciones.
   * @returns {void}
   */
  scrollToFeatures(): void {
    this._featuresSection()?.nativeElement.scrollIntoView({
      behavior: this._prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  /**
   * Revela los bloques marcados con `.reveal` cuando entran en el viewport.
   * @private
   * @returns {IntersectionObserver} Observer activo, para poder desconectarlo al destruir.
   */
  private _observeReveals(): IntersectionObserver {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: this._revealThreshold },
    );
    this._host.nativeElement
      .querySelectorAll<HTMLElement>('.reveal')
      .forEach(target => observer.observe(target));
    return observer;
  }

  /**
   * Indica si el sistema pide reducir animaciones.
   * @private
   * @returns {boolean}
   */
  private _prefersReducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }
}
