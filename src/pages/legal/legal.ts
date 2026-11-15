import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';

@Component({ selector: 'app-legal', imports: [RouterLink], templateUrl: './legal.html', styleUrl: './legal.css' })
export class Legal {
  private readonly route = inject(ActivatedRoute);
  protected readonly document = this.route.snapshot.data['document'];
  protected readonly version = environment.appVersion;
}
