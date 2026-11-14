import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Theme } from '../services/theme/theme';
import { NavigationEnd, Router, } from '@angular/router';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  // Injected at the root so the theme is applied on every route, including 404.
  private readonly theme = inject(Theme);
   private router = inject(Router);

    ngOnInit(): void {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        window.scrollTo(0, 0); // Scroll to top
      });
  }
}
