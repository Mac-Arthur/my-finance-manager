import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Onboarding } from '../../services/onboarding/onboarding';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
  styleUrl: './not-found.css',
})
export class NotFound {
  private readonly setup = inject(Onboarding);
  protected readonly destination = computed(() => this.setup.profile() ? '/home' : '/welcome');
  protected readonly destinationLabel = computed(() => this.setup.profile() ? 'Back to dashboard' : 'Start at welcome');
}
