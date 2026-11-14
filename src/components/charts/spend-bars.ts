import { Component, computed, input, linkedSignal, signal } from '@angular/core';
import { MoneyPipe } from '../../shared/money';

export interface BarDatum {
  label: string;
  /** Longer label for the tooltip, e.g. "Thu, 30 Oct". */
  title: string;
  value: number;
}

/**
 * Rounded bar chart in the style of the inspo: a dashed average line,
 * one selected bar (dark pill with a knob), hover/focus tooltips.
 */
@Component({
  selector: 'app-spend-bars',
  imports: [MoneyPipe],
  template: `
    <div class="relative h-full min-h-48 select-none" (mouseleave)="hover.set(null)">
      <!-- Plot -->
      <div class="absolute inset-x-0 top-6 bottom-7">
        <!-- Average line -->
        <div
          class="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-base-content/30 fade-in"
          [style.bottom.%]="avgPct()"
        >
          <span class="absolute -top-5 left-0 rounded-full bg-base-100/80 px-1.5 text-[11px] font-medium text-base-content/70 backdrop-blur">
            avg {{ average() | money: 'whole' }}
          </span>
        </div>

        <div class="flex h-full items-end gap-1.5 sm:gap-2">
          @for (d of data(); track d.title; let i = $index) {
            <button
              type="button"
              class="group relative flex h-full flex-1 items-end justify-center outline-none"
              [attr.aria-label]="d.title + ': ' + (d.value | money)"
              [attr.aria-pressed]="i === selected()"
              (mouseenter)="hover.set(i)"
              (focus)="hover.set(i)"
              (click)="selected.set(i)"
            >
              <span
                class="grow-y relative w-full max-w-11 rounded-[10px] transition-colors duration-300 group-focus-visible:ring-2 group-focus-visible:ring-primary"
                [class]="barClass(i, d.value)"
                [style.height.%]="pct(d.value)"
                [style.--i]="i"
              >
                @if (i === selected() && d.value > 0) {
                  <span class="absolute top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_0_4px_rgb(245_200_76/0.25)]"></span>
                }
                @if (isClipped(d.value)) {
                  <!-- Axis break: this bar is taller than the scale -->
                  <span class="absolute inset-x-0 top-7 h-1 -skew-y-12 bg-base-100"></span>
                  <span class="absolute inset-x-0 top-9.5 h-1 -skew-y-12 bg-base-100"></span>
                }
              </span>
              @if (isClipped(d.value) && hover() !== i) {
                <span class="absolute -top-5 text-[10px] font-semibold whitespace-nowrap tabular-nums">{{ d.value | money: 'compact' }}</span>
              }

              <!-- Tooltip -->
              @if (hover() === i) {
                <span
                  class="pointer-events-none absolute z-20 -translate-y-2 rounded-lg bg-neutral px-2.5 py-1.5 text-left text-xs whitespace-nowrap text-neutral-content shadow-lg fade-in"
                  [style.bottom.%]="pct(d.value)"
                >
                  <span class="block opacity-70">{{ d.title }}</span>
                  <span class="block font-semibold">{{ d.value | money }}</span>
                </span>
              }
            </button>
          }
        </div>
      </div>

      <!-- Labels -->
      <div class="absolute inset-x-0 bottom-0 flex gap-1.5 sm:gap-2">
        @for (d of data(); track d.title; let i = $index) {
          <span
            class="flex-1 text-center text-[11px] transition-colors"
            [class]="i === selected() ? 'font-semibold text-base-content' : 'text-base-content/50'"
            >{{ d.label }}</span
          >
        }
      </div>
    </div>
  `,
})
export class SpendBars {
  readonly data = input.required<BarDatum[]>();

  /** Defaults to the biggest day; resets if the data changes. */
  readonly selected = linkedSignal(() => {
    const d = this.data();
    return d.reduce((best, x, i) => (x.value > d[best].value ? i : best), 0);
  });
  readonly hover = signal<number | null>(null);

  /**
   * Y-scale ceiling. If one day dwarfs the rest (e.g. a one-off GH₵5,000 transfer),
   * cap the scale so normal days stay readable; the outlier is drawn "broken".
   */
  private readonly max = computed(() => {
    const sorted = this.data().map((d) => d.value).sort((a, b) => b - a);
    const [top = 0, second = 0] = sorted;
    if (second > 0 && top > second * 2.2) return second * 1.5;
    return Math.max(1, top) * 1.08;
  });

  isClipped(v: number) {
    return v > this.max();
  }
  readonly average = computed(() => {
    const d = this.data();
    return d.length ? d.reduce((a, b) => a + b.value, 0) / d.length : 0;
  });
  readonly avgPct = computed(() => (this.average() / this.max()) * 100);

  pct(v: number) {
    // Keep a visible stub for zero days so the rhythm of the week still reads.
    return Math.min(100, Math.max(4, (v / this.max()) * 100));
  }

  barClass(i: number, v: number) {
    if (i === this.selected()) return 'bg-neutral shadow-lg';
    if (v === 0) return 'bg-base-content/5';
    return v >= this.average()
      ? 'bg-base-content/25 group-hover:bg-base-content/40'
      : 'bg-base-content/10 group-hover:bg-base-content/25';
  }
}
