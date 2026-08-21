import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
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
      <button
        type="button"
        class="viewer-btn viewer-close"
        (click)="dismissed.emit()"
        aria-label="Cerrar"
      >
        <lucide-icon [name]="iconClose" class="h-5 w-5"></lucide-icon>
      </button>

      @if (caption()) {
        <div class="viewer-topbar" (click)="$event.stopPropagation()">
          <button
            type="button"
            class="viewer-btn"
            [disabled]="!hasPrevRecord()"
            (click)="goPrevRecord()"
            aria-label="Registro anterior"
          >
            <lucide-icon [name]="iconPrev" class="h-4 w-4"></lucide-icon>
          </button>
          <span class="viewer-caption">{{ caption() }}</span>
          <button
            type="button"
            class="viewer-btn"
            [disabled]="!hasNextRecord()"
            (click)="goNextRecord()"
            aria-label="Registro siguiente"
          >
            <lucide-icon [name]="iconNext" class="h-4 w-4"></lucide-icon>
          </button>
        </div>
      }

      @if (images().length > 1) {
        <button type="button" class="viewer-btn viewer-prev" (click)="prev()" aria-label="Anterior">
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

      <div
        class="viewer-stage"
        [class.with-note]="!!note()"
        (click)="$event.stopPropagation()"
        (wheel)="onWheel($event)"
      >
        @if (current(); as img) {
          <img
            [src]="img.url"
            [alt]="img.alt ?? 'Imagen'"
            class="viewer-img"
            [style.transform]="'scale(' + zoom() + ')'"
            draggable="false"
          />
        } @else if (emptyLabel()) {
          <p class="viewer-empty">{{ emptyLabel() }}</p>
        }
      </div>

      @if (current()) {
        <div class="viewer-footer" (click)="$event.stopPropagation()">
          @if (note()) {
            <div class="viewer-note">
              @if (noteLabel()) {
                <span class="viewer-note-label">{{ noteLabel() }}</span>
              }
              <p class="viewer-note-text">{{ note() }}</p>
            </div>
          }
          <div class="viewer-toolbar">
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
        </div>
      }
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
      .viewer-stage.with-note {
        padding-bottom: 184px;
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
      .viewer-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.16);
      }
      .viewer-btn:disabled {
        opacity: 0.35;
        cursor: default;
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
      .viewer-toolbar,
      .viewer-topbar {
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
      .viewer-topbar {
        position: absolute;
        left: 50%;
        top: 20px;
        transform: translateX(-50%);
        max-width: calc(100% - 140px);
      }
      .viewer-footer {
        position: absolute;
        left: 50%;
        bottom: 20px;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        width: min(760px, calc(100% - 40px));
      }
      .viewer-note {
        width: 100%;
        max-height: 100px;
        overflow-y: auto;
        padding: 10px 16px;
        background: rgba(0, 0, 0, 0.62);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 16px;
        backdrop-filter: blur(8px);
        text-align: left;
      }
      .viewer-note-label {
        display: block;
        margin-bottom: 2px;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.55);
      }
      .viewer-note-text {
        margin: 0;
        font-size: 13px;
        line-height: 1.55;
        white-space: pre-wrap;
        color: rgba(255, 255, 255, 0.92);
      }
      .viewer-toolbar .viewer-btn,
      .viewer-topbar .viewer-btn {
        width: 32px;
        height: 32px;
        flex: none;
      }
      .viewer-caption {
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .viewer-empty {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.7);
        text-align: center;
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
  /** Texto de la barra superior; si viene vacío la barra no se renderiza. */
  readonly caption = input<string>('');
  /** Identifica el registro visible: al cambiar se reposiciona el índice y se resetea el zoom. */
  readonly recordKey = input<string | null>(null);
  readonly hasPrevRecord = input<boolean>(false);
  readonly hasNextRecord = input<boolean>(false);
  /** Mensaje a mostrar cuando el registro actual no tiene imágenes. */
  readonly emptyLabel = input<string>('');
  /** Texto al pie del visor (p. ej. la razón de entrada); si viene vacío no se renderiza. */
  readonly note = input<string>('');
  /** Rótulo del bloque de nota; solo se muestra cuando hay nota. */
  readonly noteLabel = input<string>('');
  readonly dismissed = output();
  readonly prevRecord = output();
  readonly nextRecord = output();

  protected readonly index = signal(0);
  protected readonly zoom = signal(1);
  protected readonly current = computed<ViewerImage | undefined>(() => this.images()[this.index()]);
  protected readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);

  constructor() {
    effect(() => {
      this.recordKey();
      untracked(() => {
        this.index.set(this.clampIndex(this.startIndex()));
        this.zoom.set(1);
      });
    });
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

  protected goPrevRecord(): void {
    if (this.hasPrevRecord()) {
      this.prevRecord.emit();
    }
  }

  protected goNextRecord(): void {
    if (this.hasNextRecord()) {
      this.nextRecord.emit();
    }
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
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      this.onHorizontalKey(event);
    } else if (event.key === '+' || event.key === '=') {
      this.zoomIn();
    } else if (event.key === '-') {
      this.zoomOut();
    }
  }

  /**
   * Las flechas pasan entre las imágenes del registro actual; si solo hay una (o ninguna),
   * o si se mantiene Shift, cambian de registro.
   */
  private onHorizontalKey(event: KeyboardEvent): void {
    const backwards = event.key === 'ArrowLeft';
    if (!event.shiftKey && this.images().length > 1) {
      if (backwards) {
        this.prev();
      } else {
        this.next();
      }
      return;
    }
    if (backwards) {
      this.goPrevRecord();
    } else {
      this.goNextRecord();
    }
  }
}
