import { DatePipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { MoneyPipe } from '../../shared/money';

export interface Point {
  date: Date;
  value: number;
}

/** Area/line chart with a crosshair + tooltip that snaps to the nearest point. */
@Component({
  selector: 'app-area-chart',
  imports: [MoneyPipe, DatePipe],
  template: `
    <div class="relative h-full min-h-48" (mousemove)="move($event)" (mouseleave)="hover.set(null)">
      <!-- Y gridlines -->
      @for (g of grid(); track g.value) {
        <div class="pointer-events-none absolute inset-x-0 border-t border-base-content/5" [style.bottom.%]="g.pct">
          <span class="absolute -top-2 right-0 bg-base-100 pl-1 text-[10px] text-base-content/40">{{ g.value | money: 'compact' }}</span>
        </div>
      }

      <svg class="absolute inset-0 size-full overflow-visible" viewBox="0 0 1000 300" preserveAspectRatio="none">
        <defs>
          <linearGradient [attr.id]="gradId" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="var(--series-1)" stop-opacity="0.28" />
            <stop offset="100%" stop-color="var(--series-1)" stop-opacity="0" />
          </linearGradient>
          <clipPath [attr.id]="clipId">
            <rect x="0" y="-10" height="320" class="area-wipe" width="1000" />
          </clipPath>
        </defs>
        <g [attr.clip-path]="'url(#' + clipId + ')'">
          <path [attr.d]="areaPath()" [attr.fill]="'url(#' + gradId + ')'" />
          <path [attr.d]="linePath()" fill="none" stroke="var(--series-1)" stroke-width="2"
            vector-effect="non-scaling-stroke" stroke-linejoin="round" />
        </g>
      </svg>

      @if (hovered(); as h) {
        <div class="pointer-events-none absolute inset-y-0 w-px bg-base-content/20" [style.left.%]="h.x"></div>
        <div
          class="pointer-events-none absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-base-100 bg-[var(--series-1)] shadow"
          [style.left.%]="h.x" [style.bottom.%]="h.y"
        ></div>
        <div
          class="pointer-events-none absolute z-10 -translate-y-3 rounded-lg bg-neutral px-2.5 py-1.5 text-xs whitespace-nowrap text-neutral-content shadow-lg"
          [style.left.%]="h.x" [style.bottom.%]="h.y"
          [style.transform]="'translateX(' + (h.x > 70 ? '-100%' : h.x < 15 ? '0' : '-50%') + ') translateY(-12px)'"
        >
          <span class="block opacity-70">{{ h.point.date | date: 'EEE d MMM, HH:mm' }}</span>
          <span class="block font-semibold">{{ h.point.value | money }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    @keyframes wipe { from { width: 0; } }
    .area-wipe { animation: wipe 1200ms cubic-bezier(0.22, 1, 0.36, 1) 150ms both; }
    @media (prefers-reduced-motion: reduce) { .area-wipe { animation: none; } }
  `,
})
export class AreaChart {
  readonly points = input.required<Point[]>();

  private static seq = 0;
  readonly gradId = `area-grad-${AreaChart.seq}`;
  readonly clipId = `area-clip-${AreaChart.seq++}`;

  readonly hover = signal<number | null>(null);

  private readonly bounds = computed(() => {
    const p = this.points();
    const t0 = +p[0]?.date || 0;
    const t1 = +p[p.length - 1]?.date || 1;
    const max = Math.max(1, ...p.map((x) => x.value)) * 1.1;
    return { t0, span: Math.max(1, t1 - t0), max };
  });

  /** Points in 0..100 % space (x from left, y from bottom). */
  private readonly scaled = computed(() => {
    const { t0, span, max } = this.bounds();
    return this.points().map((point) => ({
      point,
      x: ((+point.date - t0) / span) * 100,
      y: (point.value / max) * 100,
    }));
  });

  readonly linePath = computed(() =>
    this.scaled()
      .map((s, i) => `${i ? 'L' : 'M'}${(s.x * 10).toFixed(1)},${(300 - s.y * 3).toFixed(1)}`)
      .join(' '),
  );
  readonly areaPath = computed(() => {
    const s = this.scaled();
    if (!s.length) return '';
    return `${this.linePath()} L${s[s.length - 1].x * 10},300 L${s[0].x * 10},300 Z`;
  });

  readonly grid = computed(() => {
    const { max } = this.bounds();
    const step = niceStep(max / 3);
    const lines = [];
    for (let v = step; v < max; v += step) lines.push({ value: v, pct: (v / max) * 100 });
    return lines;
  });

  readonly hovered = computed(() => {
    const i = this.hover();
    return i === null ? null : this.scaled()[i];
  });

  move(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    let best = 0;
    this.scaled().forEach((s, i) => {
      if (Math.abs(s.x - x) < Math.abs(this.scaled()[best].x - x)) best = i;
    });
    this.hover.set(best);
  }
}

function niceStep(raw: number) {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * pow;
}
