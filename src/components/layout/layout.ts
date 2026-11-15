import { Statements } from '../../services/statements/statements';
import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Navbar } from '../navbar/navbar';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, Navbar],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout {
  protected readonly statements = inject(Statements);
  constructor() { void this.statements.load(); }
}
