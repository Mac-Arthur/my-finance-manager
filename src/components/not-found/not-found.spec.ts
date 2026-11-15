import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotFound } from './not-found';
import { provideRouter } from '@angular/router';

describe('NotFound', () => {
  let component: NotFound;
  let fixture: ComponentFixture<NotFound>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotFound],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(NotFound);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('offers a safe way back into the app', () => {
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('not available');
    expect(fixture.nativeElement.querySelector('.primary-action').getAttribute('href')).toBe('/welcome');
  });
});
