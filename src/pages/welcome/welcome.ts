import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Theme } from '../../services/theme/theme';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';

@Component({ selector: 'app-welcome', imports: [RouterLink, Icon], templateUrl: './welcome.html', styleUrl: './welcome.css' })
export class Welcome {
  protected readonly theme = inject(Theme);
  protected readonly icons = ICONS;
}
