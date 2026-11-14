import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Theme } from '../services/theme/theme';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  // Injected at the root so the theme is applied on every route, including 404.
  private readonly theme = inject(Theme);
}
