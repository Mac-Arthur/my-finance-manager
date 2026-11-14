import { RouterLink } from '@angular/router';
import { Onboarding } from '../../services/onboarding/onboarding';
import { Component, inject } from '@angular/core';

@Component({
  selector: 'app-profile',
  imports: [RouterLink],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile { protected readonly setup = inject(Onboarding); }
