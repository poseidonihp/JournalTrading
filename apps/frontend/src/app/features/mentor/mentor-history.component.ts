import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideAngularModule, Trash2 } from 'lucide-angular';
import type { MentorReportSummary } from '@journal/shared-types';
import { formatDate, formatUsd } from '../../shared/format';

/**
 * Riel de informes anteriores. Abrir uno muestra su digest tal como se guardó,
 * que es lo que hace comparable un mes contra otro.
 * @class
 */
@Component({
  selector: 'app-mentor-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './mentor-history.component.html',
  styleUrl: './mentor-history.component.scss',
})
export class MentorHistoryComponent {
  readonly reports = input.required<readonly MentorReportSummary[]>();
  readonly activeId = input<string | null>(null);

  readonly opened = output<string>();
  readonly removed = output<string>();

  protected readonly iconTrash = Trash2;
  protected readonly formatUsd = formatUsd;
  protected readonly formatDate = formatDate;
}
