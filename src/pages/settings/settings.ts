import { RouterLink } from '@angular/router';
import { Theme } from '../../services/theme/theme';
import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Onboarding } from '../../services/onboarding/onboarding';
import { Statements } from '../../services/statements/statements';
import { Finance } from '../../services/finance/finance';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';

@Component({
  selector: 'app-settings',
  imports: [RouterLink, DatePipe, Icon],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  protected readonly theme = inject(Theme);
  protected readonly setup = inject(Onboarding);
  protected readonly statements = inject(Statements);
  protected readonly finance = inject(Finance);
  protected readonly icons = ICONS;

  protected readonly focusLabel = computed(() => {
    switch (this.setup.profile()?.focus) {
      case 'spend-less': return 'Building better money habits';
      case 'history': return 'Keeping your money organised';
      default: return 'Understanding where your money goes';
    }
  });
}
