import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';

@Component({
  selector: 'app-empty-state',
  imports: [RouterLink, Icon],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.css',
})
export class EmptyState {
  readonly title = input('Your money story starts here');
  readonly description = input('Add your first statement to start building your monthly history.');
  readonly action = input('Add a statement');
  readonly link = input('/statements');
  protected readonly icons = ICONS;
}
