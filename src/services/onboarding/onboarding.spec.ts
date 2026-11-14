import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Onboarding } from './onboarding';
import { setupGuard, welcomeGuard } from './onboarding.guard';

describe('Local onboarding', () => {
  let saved: Map<string, string>;
  beforeEach(() => {
    saved = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('saves a trimmed profile and restores it on a new service instance', () => {
    const service = TestBed.inject(Onboarding);
    service.complete('  Alex  ', 'history');
    expect(new Onboarding().profile()?.name).toBe('Alex');
    expect(service.initials()).toBe('A');
  });
  it('rejects blank names and does not complete setup when storage fails', () => {
    const service = TestBed.inject(Onboarding);
    expect(() => service.complete('  ', 'understand')).toThrow();
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('Quota'); } });
    expect(() => service.complete('Alex', 'understand')).toThrow(/could not save/);
    expect(service.profile()).toBeNull();
  });
  it('routes first-time visitors to welcome and returning visitors home', () => {
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => setupGuard({} as never, {} as never));
    expect(router.serializeUrl(result as import('@angular/router').UrlTree)).toBe('/welcome');
    TestBed.inject(Onboarding).complete('Alex', 'understand');
    expect(TestBed.runInInjectionContext(() => setupGuard({} as never, {} as never))).toBe(true);
    const returning = TestBed.runInInjectionContext(() => welcomeGuard({} as never, {} as never));
    expect(router.serializeUrl(returning as import('@angular/router').UrlTree)).toBe('/home');
  });
});
