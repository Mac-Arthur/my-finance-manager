import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { CATEGORIES } from '../../data/categories';
import { ImportStage, Statements } from '../../services/statements/statements';
import { CountUp } from '../../shared/count-up';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';

const STEPS: { stage: ImportStage; label: string }[] = [
  { stage: 'reading', label: 'Read' },
  { stage: 'extracting', label: 'Extract' },
  { stage: 'sorting', label: 'Sort' },
  { stage: 'building', label: 'Build' },
];
const TITLES: Record<ImportStage, string> = {
  reading: 'Reading your statement',
  extracting: 'Pulling out every transaction',
  sorting: 'Sorting where your money went',
  building: 'Building your dashboard',
  done: 'Your dashboard is ready',
};
/** Where category chips land, as edge/top percentages. Odd slots anchor to the right edge so labels never overflow on phones. */
const SLOTS = [[2, 2], [0, 21], [0, 44], [0, 63], [6, 85], [4, 85]];

/** Full-screen, step-by-step animation shown while a statement is imported. */
@Component({
  selector: 'app-import-loader',
  imports: [CountUp, DatePipe, Icon],
  templateUrl: './import-loader.html',
  styleUrl: './import-loader.css',
})
export class ImportLoader {
  protected readonly store = inject(Statements);
  protected readonly icons = ICONS;
  protected readonly steps = STEPS;
  protected readonly stage = this.store.importStage;
  protected readonly summary = this.store.importSummary;
  protected readonly title = computed(() => TITLES[this.stage()]);
  protected readonly stepIndex = computed(() => this.stage() === 'done' ? STEPS.length : STEPS.findIndex(s => s.stage === this.stage()));
  /** Reading progress comes from the real page count; later stages advance in fixed steps. */
  protected readonly percent = computed(() => {
    const page = /page (\d+) of (\d+)/i.exec(this.store.progress());
    if (this.stage() === 'reading') return page ? 4 + (21 * +page[1]) / +page[2] : 8;
    return ({ reading: 25, extracting: 45, sorting: 68, building: 88, done: 100 } satisfies Record<ImportStage, number>)[this.stage()];
  });
  protected readonly chips = computed(() => (this.summary()?.categories ?? []).slice(0, SLOTS.length).map((c, i) => ({
    ...c, icon: CATEGORIES[c.id].icon, left: i % 2 ? null : SLOTS[i][0], right: i % 2 ? SLOTS[i][0] : null, top: SLOTS[i][1], delay: i * 140,
  })));
  protected readonly rows = [0, 1, 2, 3, 4, 5];
  protected readonly bars = [46, 72, 38, 90, 58, 66];
}
