import { vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';

describe('App', () => {
  let versionUpdates: Subject<unknown>;
  let unrecoverable: Subject<unknown>;
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(async () => {
    versionUpdates = new Subject();
    unrecoverable = new Subject();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: SwUpdate, useValue: { isEnabled: true, versionUpdates, unrecoverable } }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders the routed app shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('offers a safe reload only after a new version is ready', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('A new version is ready');
    versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'old' }, latestVersion: { hash: 'new' } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('A new version is ready');
    expect(fixture.nativeElement.textContent).toContain('Your local data will stay here');
  });
});
