import { inject } from '@angular/core';
import { CanActivateFn, CanActivateChildFn, Router } from '@angular/router';
import { Onboarding } from './onboarding';

export const setupGuard: CanActivateChildFn = () =>
  inject(Onboarding).profile() ? true : inject(Router).createUrlTree(['/welcome']);

export const welcomeGuard: CanActivateFn = () =>
  inject(Onboarding).profile() ? inject(Router).createUrlTree(['/home']) : true;
