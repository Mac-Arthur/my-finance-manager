import { Component, computed, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MoneyPipe } from '../../shared/money';

export interface DonutSlice {
  id: string;
  label: string;
  value: number;
  /** CSS colour, e.g. var(--series-1). */
  color: string;
}

/**
 * Donut with round-capped, gapped segments and a centre readout.
 * Hovering a segment (or a legend row via `active`) shows it in the centre.
 */
@Component({
  selector: 'app-donut',
  imports: [MoneyPipe, DecimalPipe],
  template: `
    <div class="relative mx-auto aspect-square w-full max-w-64">
      <svg viewBox="0 0 120 120" class="size-full -rotate-90" (mouseleave)="hovered.set(null)">
        <!-- Track -->
        <circle cx="60" cy="60" [attr.r]="r" fill="none" class="stroke-base-content/5" [attr.stroke-width]="width" />
        <!-- Tick ring, like the inspo's clock face -->
        @for (t of ticks; track t) {
          <line x1="60" y1="25" x2="60" [attr.y2]="t % 3 === 0 ? 29.5 : 27.5" class="stroke-base-content/20"
            stroke-width="0.8" stroke-linecap="round" [attr.transform]="'rotate(' + t * 15 + ' 60 60)'" />
        }
        @for (s of segments(); track s.id; let i = $index) {
          <circle
            cx="60" cy="60" [attr.r]="r" fill="none" pathLength="100"
            [attr.stroke]="s.color"
            [attr.stroke-width]="hovered() === s.id || active() === s.id ? width + 3 : width"
            stroke-linecap="round"
            [attr.stroke-dasharray]="s.len + ' ' + (100 - s.len)"
            [attr.stroke-dashoffset]="-s.offset"
            class="donut-seg cursor-pointer transition-[stroke-width,opacity] duration-300"
            [style.opacity]="dim(s.id) ? 0.35 : 1"
            [style.--i]="i"
            (mouseenter)="hovered.set(s.id)"
          >
            <title>{{ s.label }}: {{ s.value | money }}</title>
          </circle>
        }
      </svg>

      <!-- Centre -->
      <div class="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div class="text-xs text-base-content/60">{{ focus()?.label ?? centerLabel() }}</div>
          <div class="text-2xl font-semibold tracking-tight sm:text-3xl">
            {{ (focus()?.value ?? total()) | money: 'whole' }}
          </div>
          @if (focus(); as f) {
            <div class="text-xs text-base-content/60">{{ (f.value / total()) * 100 | number: '1.0-0' }}% of total</div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    @keyframes draw { from { stroke-dasharray: 0 100; } }
    .donut-seg { animation: draw 900ms cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: calc(var(--i) * 90ms); }
    @media (prefers-reduced-motion: reduce) { .donut-seg { animation: none; } }
  `,
})
export class Donut {
  readonly slices = input.required<DonutSlice[]>();
  readonly centerLabel = input('Total spend');
  /** Externally highlighted slice (e.g. hovered legend row). */
  readonly active = input<string | null>(null);

  readonly r = 46;
  readonly width = 9;
  readonly ticks = Array.from({ length: 24 }, (_, i) => i);
  readonly hovered = signal<string | null>(null);

  readonly total = computed(() => this.slices().reduce((a, s) => a + s.value, 0));

  /** Gap between segments in pathLength units (round caps eat into it, so it's generous). */
  private readonly gap = 3.2;

  readonly segments = computed(() => {
    const total = this.total() || 1;
    let offset = 0;
    return this.slices().map((s) => {
      const share = (s.value / total) * 100;
      const len = Math.max(0.5, share - this.gap);
      const seg = { ...s, len, offset: offset + this.gap / 2 };
      offset += share;
      return seg;
    });
  });

  readonly focus = computed(() => {
    const id = this.hovered() ?? this.active();
    return this.slices().find((s) => s.id === id) ?? null;
  });

  dim(id: string) {
    const f = this.hovered() ?? this.active();
    return f !== null && f !== id;
  }
}
