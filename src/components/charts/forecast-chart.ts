import { DatePipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { ForecastDay } from '../../services/finance/forecast';
import { MoneyPipe } from '../../shared/money';

/** Middle-estimate line with a shaded low–high range, a zero line, and a crosshair that snaps to the nearest day. */
@Component({
  selector: 'app-forecast-chart',
  imports: [MoneyPipe, DatePipe],
  template: `
    <div class="relative h-56 touch-pan-y sm:h-64" role="img" [attr.aria-label]="label()"
      (pointermove)="move($event)" (pointerdown)="move($event)" (pointerleave)="hover.set(null)">
      @for (line of grid(); track line.value) {
        <div class="pointer-events-none absolute inset-x-0 border-t" [class]="line.value === 0 ? 'border-dashed border-base-content/40' : 'border-base-content/5'" [style.bottom.%]="line.pct">
          <span class="absolute -top-2 right-0 rounded bg-base-100 pl-1 text-[10px] text-base-content/50">{{ line.value | money: 'compact' : relative() && line.value !== 0 }}</span>
        </div>
      }
      <svg class="absolute inset-0 size-full overflow-visible" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
        <defs><clipPath [attr.id]="clipId"><rect x="0" y="-10" height="320" width="1000" class="wipe" /></clipPath></defs>
        <g [attr.clip-path]="'url(#' + clipId + ')'">
          <path [attr.d]="bandPath()" fill="var(--series-1)" fill-opacity="0.16" />
          <path [attr.d]="linePath()" fill="none" stroke="var(--series-1)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
        </g>
      </svg>
      @if (lowPoint(); as low) {
        <div class="pointer-events-none absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-base-100 bg-[var(--series-1)]" [style.left.%]="low.x" [style.bottom.%]="low.y"></div>
        <span class="pointer-events-none absolute text-[10px] font-semibold whitespace-nowrap text-base-content/70" [style.left.%]="low.x" [style.bottom.%]="low.y"
          [style.transform]="'translate(' + (low.x > 80 ? '-100%' : low.x < 12 ? '0' : '-50%') + ', ' + (low.y < 15 ? '-70%' : '140%') + ')'">Lowest</span>
      }
      @if (hovered(); as h) {
        <div class="pointer-events-none absolute inset-y-0 w-px bg-base-content/25" [style.left.%]="h.x"></div>
        <div class="pointer-events-none absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-base-100 bg-[var(--series-1)] shadow" [style.left.%]="h.x" [style.bottom.%]="h.y"></div>
        <div class="pointer-events-none absolute top-0 z-10 rounded-lg bg-neutral px-2.5 py-1.5 text-xs whitespace-nowrap text-neutral-content shadow-lg" [style.left.%]="h.x"
          [style.transform]="'translateX(' + (h.x > 65 ? '-105%' : '5%') + ')'">
          <span class="block opacity-70">{{ h.day.date | date: 'EEE d MMM' }} · day {{ h.day.day }}</span>
          <span class="block font-semibold">{{ h.day.mid | money: 'whole' : relative() }}</span>
          @if (h.day.day > 0) { <span class="block opacity-70">Range {{ h.day.low | money: 'whole' : relative() }} to {{ h.day.high | money: 'whole' : relative() }}</span> }
        </div>
      }
    </div>
    <div class="mt-2 flex justify-between text-[10px] text-base-content/50" aria-hidden="true">
      @for (tick of ticks(); track tick.day) { <span>{{ tick.date | date: 'd MMM' }}</span> }
    </div>
    <p class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-base-content/60">
      <span class="inline-flex items-center gap-1.5"><i class="h-0.5 w-4 rounded bg-[var(--series-1)]"></i>Middle estimate</span>
      <span class="inline-flex items-center gap-1.5"><i class="size-3 rounded-sm bg-[var(--series-1)] opacity-25"></i>Likely range (8 in 10 replays of your past days)</span>
    </p>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    @keyframes wipe { from { width: 0; } }
    .wipe { animation: wipe 1100ms cubic-bezier(0.22, 1, 0.36, 1) 100ms both; }
    @media (prefers-reduced-motion: reduce) { .wipe { animation: none; } }
  `,
})
export class ForecastChart {
  readonly days = input.required<ForecastDay[]>();
  /** True when there is no starting balance: values are money gained or used, shown with a sign. */
  readonly relative = input(false);

  private static seq = 0;
  readonly clipId = `forecast-clip-${ForecastChart.seq++}`;
  readonly hover = signal<number | null>(null);

  private readonly bounds = computed(() => {
    const days = this.days();
    let min = Math.min(...days.map(day => day.low));
    let max = Math.max(...days.map(day => day.high));
    // Show the distance to zero whenever zero is close enough to matter.
    if (min > 0 && min < max * .6) min = 0;
    if (max < 0) max = 0;
    const pad = Math.max(1, max - min) * .08;
    return { min: min === 0 ? 0 : min - pad, max: max + pad };
  });
  private readonly scaled = computed(() => {
    const { min, max } = this.bounds();
    const days = this.days();
    const y = (value: number) => ((value - min) / (max - min)) * 100;
    return days.map(day => ({ day, x: (day.day / Math.max(1, days.length - 1)) * 100, y: y(day.mid), low: y(day.low), high: y(day.high) }));
  });
  private readonly point = (x: number, y: number) => `${(x * 10).toFixed(1)},${(300 - y * 3).toFixed(1)}`;

  readonly linePath = computed(() => this.scaled().map((s, i) => `${i ? 'L' : 'M'}${this.point(s.x, s.y)}`).join(' '));
  readonly bandPath = computed(() => {
    const s = this.scaled();
    return s.length ? `M${s.map(p => this.point(p.x, p.high)).join(' L')} L${[...s].reverse().map(p => this.point(p.x, p.low)).join(' L')} Z` : '';
  });
  readonly grid = computed(() => {
    const { min, max } = this.bounds();
    const step = niceStep((max - min) / 3);
    const lines = [];
    for (let value = Math.ceil(min / step) * step; value < max; value += step) {
      if (value > min || value === 0) lines.push({ value, pct: ((value - min) / (max - min)) * 100 });
    }
    return lines;
  });
  readonly ticks = computed(() => this.days().filter(day => day.day % 30 === 0));
  readonly lowPoint = computed(() => {
    const scaled = this.scaled();
    const low = scaled.reduce((lowest, item) => item.day.mid < lowest.day.mid ? item : lowest, scaled[0]);
    return low && low.day.day > 0 ? low : null;
  });
  readonly hovered = computed(() => {
    const index = this.hover();
    return index === null ? null : this.scaled()[index] ?? null;
  });
  readonly label = computed(() => {
    const days = this.days();
    const last = days.at(-1);
    return last ? `Estimated path over ${last.day} days. The middle estimate moves from ${Math.round(days[0].mid)} to ${Math.round(last.mid)}, with a likely range of ${Math.round(last.low)} to ${Math.round(last.high)} at the end. The same figures are listed below the chart.` : '';
  });

  move(event: PointerEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const count = this.days().length;
    this.hover.set(Math.max(0, Math.min(count - 1, Math.round(((event.clientX - rect.left) / rect.width) * (count - 1)))));
  }
}

function niceStep(raw: number) {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * pow;
}
