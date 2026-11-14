import { Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';
import { MoneyFormat, formatMoney } from './money';

/**
 * Animates a number from its previous value to the new one.
 * `<span [countUp]="1234.5"></span>` renders GH₵1,234.50.
 * `countUpFormat="percent"` renders 42%, `"number"` renders 1,235.
 */
@Directive({ selector: '[countUp]' })
export class CountUp implements OnDestroy {
  readonly countUp = input.required<number>();
  readonly countUpFormat = input<MoneyFormat | 'percent' | 'number'>('full');
  readonly countUpDuration = input(900);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private current = 0;
  private frame = 0;

  constructor() {
    effect(() => this.animateTo(this.countUp()));
  }

  private render(value: number) {
    const f = this.countUpFormat();
    this.el.textContent =
      f === 'percent'
        ? `${Math.round(value)}%`
        : f === 'number'
          ? Math.round(value).toLocaleString('en-GH')
          : formatMoney(value, f);
  }

  private animateTo(target: number) {
    cancelAnimationFrame(this.frame);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = this.current;
    const duration = this.countUpDuration();
    if (reduced || duration <= 0) {
      this.current = target;
      this.render(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4); // ease-out-quart
      this.current = from + (target - from) * eased;
      this.render(this.current);
      if (p < 1) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.frame);
  }
}
