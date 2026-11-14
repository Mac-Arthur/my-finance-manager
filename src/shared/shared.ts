import { CommonModule, CurrencyPipe, DatePipe, NgClass, NgStyle } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

export const Shared = [
  CommonModule,
  NgClass,
  NgStyle,
  CurrencyPipe,
  DatePipe,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  FormsModule,
  ReactiveFormsModule,
  
];
