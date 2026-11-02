import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/**
 * OIDC redirect callback page.
 *
 * angular-oauth2-oidc processes the authorization code and exchanges it for
 * tokens inside loadDiscoveryDocumentAndTryLogin() which runs during app init.
 * By the time this component activates, the tokens are already stored.
 * We just update auth state and redirect to the default route.
 */
@Component({
  selector: 'app-callback',
  standalone: true,
  template: `
    <div class="callback-container" role="status" aria-live="polite">
      <p>Completing sign in…</p>
    </div>
  `,
  styles: [`
    .callback-container {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100dvh;
      color: var(--text-color-secondary);
    }
  `],
})
export class CallbackComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.auth.completeLogin();
    this.router.navigate(['/i2p/health'], { replaceUrl: true });
  }
}
