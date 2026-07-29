import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LogIn } from 'lucide-angular';
import { AuthStore } from '../../core/auth/auth.store';
import { ErrorBannerComponent } from '../../shared/ui/error-banner.component';
import { FieldComponent } from '../../shared/ui/field.component';
import { SubmitButtonComponent } from '../../shared/ui/submit-button.component';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FieldComponent, ErrorBannerComponent, SubmitButtonComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})

export class LoginComponent {
  protected readonly iconLogin = LogIn;
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(1)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.auth.login(this.form.getRawValue());
      await this.router.navigateByUrl('/dashboard');
    } catch {
      this.errorMessage.set(this.auth.error() ?? 'No se pudo iniciar sesión');
    } finally {
      this.submitting.set(false);
    }
  }
}
