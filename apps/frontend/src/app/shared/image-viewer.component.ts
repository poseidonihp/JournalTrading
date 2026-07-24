import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { LucideAngularModule, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-angular';

export interface ViewerImage {
  url: string;
  alt?: string;
}

@Component({
  selector: 'app-image-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <div
      class="viewer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Visor de imagen"
      (click)="onBackdropClick($event)"
    >
      <button type="button" class="viewer-btn viewer-close" (click)="dismissed.emit()" aria-label="Cerrar">
        <lucide-icon [name]="iconClose" class="h-5 w-5"></lucide-icon>
      </button>

      @if (images().length > 1) {
        <button
          type="button"
          class="viewer-btn viewer-prev"
          (click)="prev()"
          aria-label="Anterior"
        >
          <lucide-icon [name]="iconPrev" class="h-6 w-6"></lucide-icon>
        </button>
        <button
          type="button"
          class="viewer-btn viewer-next"
          (click)="next()"
          aria-label="Siguiente"
        >
          <lucide-icon [name]="iconNext" class="h-6 w-6"></lucide-icon>
        </button>
      }

      <div class="viewer-toolbar" (click)="$event.stopPropagation()">
        <button type="button" class="viewer-btn" (click)="zoomOut()" aria-label="Reducir">
          <lucide-icon [name]="iconZoomOut" class="h-4 w-4"></lucide-icon>
        </button>
        <span class="viewer-zoom">{{ zoomLabel() }}</span>
        <button type="button" class="viewer-btn" (click)="zoomIn()" aria-label="Ampliar">
          <lucide-icon [name]="iconZoomIn" class="h-4 w-4"></lucide-icon>
        </button>
        @if (images().length > 1) {
          <span class="viewer-counter">{{ index() + 1 }} / {{ images().length }}</span>
        }
      </div>

      <div class="viewer-stage" (click)="$event.stopPropagation()" (wheel)="onWheel($event)">
        @if (current(); as img) {
          <img
            [src]="img.url"
            [alt]="img.alt ?? 'Imagen'"
            class="viewer-img"
            [style.transform]="'scale(' + zoom() + ')'"
            draggable="false"
          />
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 1000;
      }
      .viewer-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: viewer-fade 120ms ease-out;
      }
      @keyframes viewer-fade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      .viewer-stage {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: auto;
        padding: 64px;
      }
      .viewer-img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        transform-origin: center center;
        transition: transform 120ms ease-out;
        user-select: none;
        -webkit-user-drag: none;
      }
      .viewer-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 9999px;
        width: 40px;
        height: 40px;
        cursor: pointer;
        backdrop-filter: blur(6px);
        transition:
          background 120ms ease,
          transform 120ms ease;
      }
      .viewer-btn:hover {
        background: rgba(255, 255, 255, 0.16);
      }
      .viewer-close {
        position: absolute;
        top: 20px;
        right: 20px;
      }
      .viewer-prev {
        position: absolute;
        left: 20px;
        top: 50%;
        transform: translateY(-50%);
        width: 48px;
        height: 48px;
      }
      .viewer-next {
        position: absolute;
        right: 20px;
        top: 50%;
        transform: translateY(-50%);
        width: 48px;
        height: 48px;
      }
      .viewer-toolbar {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        background: rgba(0, 0, 0, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 9999px;
        backdrop-filter: blur(8px);
        color: #fff;
      }
      .viewer-toolbar .viewer-btn {
        width: 32px;
        height: 32px;
      }
      .viewer-zoom {
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        min-width: 44px;
        text-align: center;
      }
      .viewer-counter {
        font-size: 12px;
        padding-left: 8px;
        margin-left: 4px;
        border-left: 1px solid rgba(255, 255, 255, 0.18);
        color: rgba(255, 255, 255, 0.85);
      }
    `,
  ],
})
export class ImageViewerComponent {
  protected readonly iconClose = X;
  protected readonly iconPrev = ChevronLeft;
  protected readonly iconNext = ChevronRight;
  protected readonly iconZoomIn = ZoomIn;
  protected readonly iconZoomOut = ZoomOut;

  readonly images = input.required<ViewerImage[]>();
  readonly startIndex = input<number>(0);
  readonly dismissed = output();

  protected readonly index = signal(0);
  protected readonly zoom = signal(1);
  protected readonly current = computed<ViewerImage | undefined>(() => this.images()[this.index()]);
  protected readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);

  constructor() {
    queueMicrotask(() => this.index.set(this.clampIndex(this.startIndex())));
  }

  private clampIndex(i: number): number {
    const len = this.images().length;
    if (len === 0) {
      return 0;
    }
    return Math.min(Math.max(i, 0), len - 1);
  }

  protected prev(): void {
    const len = this.images().length;
    if (len === 0) {
      return;
    }
    this.zoom.set(1);
    this.index.update((i) => (i - 1 + len) % len);
  }

  protected next(): void {
    const len = this.images().length;
    if (len === 0) {
      return;
    }
    this.zoom.set(1);
    this.index.update((i) => (i + 1) % len);
  }

  protected zoomIn(): void {
    this.zoom.update((z) => Math.min(z + 0.25, 5));
  }

  protected zoomOut(): void {
    this.zoom.update((z) => Math.max(z - 0.25, 0.25));
  }

  protected onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    if (event.deltaY < 0) {
      this.zoomIn();
    } else {
      this.zoomOut();
    }
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.dismissed.emit();
    }
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.dismissed.emit();
    } else if (event.key === 'ArrowLeft') {
      this.prev();
    } else if (event.key === 'ArrowRight') {
      this.next();
    } else if (event.key === '+' || event.key === '=') {
      this.zoomIn();
    } else if (event.key === '-') {
      this.zoomOut();
    }
  }
}
