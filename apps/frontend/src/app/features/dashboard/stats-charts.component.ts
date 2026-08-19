import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const DONUT_R = 22;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;

@Component({
  selector: 'app-mini-donut',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 60 60" class="mini">
      <circle cx="30" cy="30" r="22" fill="none" stroke="var(--qp-line)" stroke-width="7" />
      @if (model().lossDash) {
        <circle
          cx="30"
          cy="30"
          r="22"
          fill="none"
          stroke="var(--qp-clay)"
          stroke-width="7"
          stroke-linecap="round"
          [attr.stroke-dasharray]="model().lossDash"
          [attr.stroke-dashoffset]="model().lossOffset"
          transform="rotate(-90 30 30)"
        />
      }
      @if (model().winDash) {
        <circle
          cx="30"
          cy="30"
          r="22"
          fill="none"
          stroke="var(--qp-sage)"
          stroke-width="7"
          stroke-linecap="round"
          [attr.stroke-dasharray]="model().winDash"
          [attr.stroke-dashoffset]="model().winOffset"
          transform="rotate(-90 30 30)"
        />
      }
      @if (model().beDash) {
        <circle
          cx="30"
          cy="30"
          r="22"
          fill="none"
          stroke="var(--qp-mute-2)"
          stroke-width="7"
          stroke-linecap="round"
          [attr.stroke-dasharray]="model().beDash"
          [attr.stroke-dashoffset]="model().beOffset"
          transform="rotate(-90 30 30)"
        />
      }
    </svg>
  `,
  styles: [`.mini { width: 54px; height: 54px; display: block; }`],
})
export class MiniDonutComponent {
  readonly wins = input.required<number>();
  readonly losses = input.required<number>();
  readonly breakEven = input<number>(0);

  protected readonly model = computed(() => {
    const w = this.wins();
    const l = this.losses();
    const be = this.breakEven();
    const total = w + l + be;
    if (total === 0) {
      return { winDash: '', winOffset: 0, lossDash: '', lossOffset: 0, beDash: '', beOffset: 0 };
    }
    const winLen = (w / total) * DONUT_CIRC;
    const lossLen = (l / total) * DONUT_CIRC;
    const beLen = (be / total) * DONUT_CIRC;
    return {
      winDash: `${winLen.toFixed(2)} ${(DONUT_CIRC - winLen).toFixed(2)}`,
      winOffset: 0,
      lossDash: `${lossLen.toFixed(2)} ${(DONUT_CIRC - lossLen).toFixed(2)}`,
      lossOffset: -winLen,
      beDash: `${beLen.toFixed(2)} ${(DONUT_CIRC - beLen).toFixed(2)}`,
      beOffset: -(winLen + lossLen),
    };
  });
}

@Component({
  selector: 'app-mini-diverge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track">
      <div class="pos" [style.flex]="model().posFlex"></div>
      <div class="neg" [style.flex]="model().negFlex"></div>
      @if (model().neutralFlex) {
        <div class="neu" [style.flex]="model().neutralFlex"></div>
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; width: 100%; }
      .track {
        display: flex;
        height: 8px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--qp-line);
        gap: 2px;
      }
      .pos { background: var(--qp-sage); min-width: 0; }
      .neg { background: var(--qp-clay); min-width: 0; }
      .neu { background: var(--qp-mute-2); min-width: 0; }
    `,
  ],
})
export class MiniDivergeComponent {
  readonly positive = input.required<number>();
  readonly negative = input.required<number>();
  /** Tercer tramo neutro, para los break-even. Sin valor, la barra queda como antes. */
  readonly neutral = input<number>(0);

  protected readonly model = computed(() => {
    const p = Math.abs(this.positive());
    const n = Math.abs(this.negative());
    const u = Math.abs(this.neutral());
    const total = p + n + u;
    if (total === 0) {
      return { posFlex: 1, negFlex: 1, neutralFlex: 0 };
    }
    return { posFlex: p / total, negFlex: n / total, neutralFlex: u / total };
  });
}

const GAUGE_MAX = 3;
const GAUGE_CX = 35;
const GAUGE_CY = 36;
const GAUGE_R = 22;

@Component({
  selector: 'app-mini-gauge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 70 42" class="g">
      <path d="M 8 36 A 27 27 0 0 1 62 36" fill="none" stroke="var(--qp-clay)" stroke-width="6" stroke-linecap="round" />
      <path d="M 35 9 A 27 27 0 0 1 62 36" fill="none" stroke="var(--qp-sage)" stroke-width="6" stroke-linecap="round" />
      <line
        x1="35"
        y1="36"
        [attr.x2]="model().nx"
        [attr.y2]="model().ny"
        stroke="var(--qp-ink)"
        stroke-width="2"
        stroke-linecap="round"
      />
      <circle cx="35" cy="36" r="3" fill="var(--qp-ink)" />
    </svg>
  `,
  styles: [`.g { width: 70px; height: 42px; display: block; }`],
})
export class MiniGaugeComponent {
  readonly value = input.required<number | null>();

  protected readonly model = computed(() => {
    const v = this.value();
    let ratio: number;
    if (v === null || v === undefined) {
      ratio = 1;
    } else {
      ratio = Math.min(Math.max(v / GAUGE_MAX, 0), 1);
    }
    const angle = Math.PI - ratio * Math.PI;
    return {
      nx: GAUGE_CX + GAUGE_R * Math.cos(angle),
      ny: GAUGE_CY - GAUGE_R * Math.sin(angle),
    };
  });
}

@Component({
  selector: 'app-mini-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track">
      <div class="fill" [style.width.%]="ratio() * 100" [style.background]="color()"></div>
    </div>
  `,
  styles: [
    `
      :host { display: block; width: 100%; }
      .track {
        height: 6px;
        border-radius: 999px;
        background: var(--qp-line);
        overflow: hidden;
      }
      .fill { height: 100%; border-radius: 999px; }
    `,
  ],
})
export class MiniBarComponent {
  readonly ratio = input.required<number>();
  readonly color = input<string>('var(--qp-sage)');
}
