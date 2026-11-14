import { Component, computed, input } from '@angular/core';
import { Icon } from '../../shared/icon';

/** Small progress ring with an icon in the middle (the inspo's Income / Spending / Net gauges). */
@Component({
  selector: 'app-ring',
  imports: [Icon],
  template: `
    <div class="relative size-full">
      <svg viewBox="0 0 48 48" class="size-full -rotate-90">
        <circle cx="24" cy="24" r="20" fill="none" stroke-width="4.5" class="stroke-base-content/5" />
        <circle
          cx="24" cy="24" r="20" fill="none" stroke-width="4.5" stroke-linecap="round" pathLength="100"
          [attr.stroke]="color()"
          [attr.stroke-dasharray]="pct() + ' 100'"
          class="ring-arc"
        />
      </svg>
      <div class="absolute inset-[22%] grid place-items-center rounded-full bg-base-100 shadow-sm">
        <app-icon [path]="icon()" class="size-1/2" [style.color]="color()" />
      </div>
    </div>
  `,
  styles: `
    @keyframes ring { from { stroke-dasharray: 0 100; } }
    .ring-arc { animation: ring 1100ms cubic-bezier(0.22, 1, 0.36, 1) 300ms both; }
    @media (prefers-reduced-motion: reduce) { .ring-arc { animation: none; } }
  `,
})
export class Ring {
  /** 0..1 */
  readonly value = input.required<number>();
  readonly icon = input.required<string>();
  readonly color = input('var(--series-1)');

  readonly pct = computed(() => Math.max(2, Math.min(100, this.value() * 100)));
}
