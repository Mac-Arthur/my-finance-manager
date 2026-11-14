import { Component, input } from '@angular/core';

/** Stroke icon from a 24x24 path string. `<app-icon [path]="..." class="size-4" />` */
@Component({
  selector: 'app-icon',
  template: `
    <svg class="size-full" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      [attr.stroke-width]="stroke()" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path [attr.d]="path()" />
    </svg>
  `,
  host: { class: 'inline-block shrink-0' },
})
export class Icon {
  readonly path = input.required<string>();
  readonly stroke = input(1.8);
}
