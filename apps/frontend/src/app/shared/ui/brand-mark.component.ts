import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'journal-brand-mark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './brand-mark.component.html',
  styleUrl: './brand-mark.component.scss',
})
export class BrandMarkComponent {}
