import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { AuthService } from '../core/auth/auth.service';
import { LocaleService, SupportedLang } from '../core/i18n/locale.service';
import { ThemeService, Theme } from '../core/theme/theme.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoModule],
  template: `
    <a class="skip-to-main" href="#main-content">{{ 'shell.skipToMain' | transloco }}</a>

    <div class="shell-layout" [attr.data-sidebar-open]="sidebarOpen">
      <!-- ── Top bar ────────────────────────────────────────────────── -->
      <header class="shell-topbar" role="banner">
        <button
          class="topbar-menu-toggle"
          type="button"
          (click)="toggleSidebar()"
          [attr.aria-expanded]="sidebarOpen"
          aria-controls="shell-sidebar"
          [attr.aria-label]="'shell.toggleNav' | transloco"
        >
          <span class="icon-hamburger" aria-hidden="true">☰</span>
        </button>

        <span class="topbar-brand" aria-label="{{ 'shell.appName' | transloco }}">
          <strong>{{ 'shell.appName' | transloco }}</strong>
        </span>

        <nav class="topbar-actions" aria-label="{{ 'shell.toolbarNav' | transloco }}">
          <!-- Language switcher -->
          <div class="topbar-control" role="group" aria-label="{{ 'shell.language' | transloco }}">
            @for (l of locale.availableLangs; track l.code) {
              <button
                type="button"
                class="topbar-btn"
                [class.active]="locale.lang() === l.code"
                (click)="locale.setLang(l.code)"
                [attr.aria-pressed]="locale.lang() === l.code"
                [attr.aria-label]="l.label"
              >{{ l.code.toUpperCase() }}</button>
            }
          </div>

          <!-- Theme switcher -->
          <div class="topbar-control" role="group" aria-label="{{ 'shell.theme' | transloco }}">
            @for (t of theme.availableThemes; track t.value) {
              <button
                type="button"
                class="topbar-btn"
                [class.active]="theme.theme() === t.value"
                (click)="theme.setTheme(t.value)"
                [attr.aria-pressed]="theme.theme() === t.value"
                [attr.aria-label]="t.label"
                [title]="t.label"
              >{{ t.icon }}</button>
            }
          </div>

          <!-- Auth -->
          @if (auth.isConfigured()) {
            @if (auth.isAuthenticated()) {
              <button
                type="button"
                class="topbar-btn topbar-btn--auth"
                (click)="auth.logout()"
              >{{ 'shell.logout' | transloco }}</button>
            } @else {
              <button
                type="button"
                class="topbar-btn topbar-btn--auth topbar-btn--primary"
                (click)="auth.login()"
              >{{ 'shell.login' | transloco }}</button>
            }
          }
        </nav>
      </header>

      <!-- ── Sidebar ───────────────────────────────────────────────── -->
      <nav
        id="shell-sidebar"
        class="shell-sidebar"
        aria-label="{{ 'shell.mainNav' | transloco }}"
      >
        <ul class="sidebar-nav-list" role="list">
          <li class="sidebar-section-label" aria-hidden="true">
            {{ 'shell.sections.i2p' | transloco }}
          </li>
          <li>
            <a
              routerLink="/i2p/health"
              routerLinkActive="active"
              class="sidebar-nav-link"
              [attr.aria-label]="'i2p.health.title' | transloco"
            >
              <span class="nav-icon" aria-hidden="true">🔗</span>
              <span class="nav-label">{{ 'i2p.health.title' | transloco }}</span>
            </a>
          </li>
          <li>
            <a
              routerLink="/i2p/exchanges"
              routerLinkActive="active"
              class="sidebar-nav-link"
              [attr.aria-label]="'i2p.exchanges.title' | transloco"
            >
              <span class="nav-icon" aria-hidden="true">🔄</span>
              <span class="nav-label">{{ 'i2p.exchanges.title' | transloco }}</span>
            </a>
          </li>
        </ul>
      </nav>

      <!-- ── Main content ──────────────────────────────────────────── -->
      <main id="main-content" class="shell-main" role="main">
        @if (!auth.isConfigured()) {
          <div class="shell-banner" role="status">
            {{ 'shell.authUnconfiguredBanner' | transloco }}
          </div>
        }
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .shell-layout {
      display: grid;
      grid-template-areas:
        "topbar topbar"
        "sidebar main";
      grid-template-columns: 240px 1fr;
      grid-template-rows: 56px 1fr;
      min-height: 100dvh;
    }

    .shell-topbar {
      grid-area: topbar;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0 1rem;
      background: var(--surface-card);
      border-bottom: 1px solid var(--surface-border);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .topbar-brand {
      flex: 1;
      font-size: 1rem;
      color: var(--text-color);
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .topbar-control {
      display: flex;
      gap: 0.25rem;
      padding: 0.25rem;
      background: var(--surface-ground);
      border-radius: 6px;
    }

    .topbar-btn {
      padding: 0.25rem 0.5rem;
      border: none;
      background: transparent;
      color: var(--text-color-secondary);
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8125rem;
      transition: background 0.15s, color 0.15s;

      &:hover, &.active {
        background: var(--primary-color);
        color: var(--primary-color-text);
      }
    }

    .topbar-btn--primary {
      background: var(--primary-color);
      color: var(--primary-color-text);
    }

    .topbar-menu-toggle {
      display: none;
      padding: 0.25rem 0.5rem;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 1.25rem;
      color: var(--text-color);
    }

    .shell-sidebar {
      grid-area: sidebar;
      background: var(--surface-section);
      border-inline-end: 1px solid var(--surface-border);
      padding: 1rem 0;
      overflow-y: auto;
    }

    .sidebar-nav-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .sidebar-section-label {
      padding: 0.5rem 1.25rem;
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    .sidebar-nav-link {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 1.25rem;
      text-decoration: none;
      color: var(--text-color-secondary);
      font-size: 0.9375rem;
      transition: background 0.15s, color 0.15s;

      &:hover {
        background: var(--surface-hover);
        color: var(--text-color);
      }

      &.active {
        background: color-mix(in srgb, var(--primary-color) 10%, transparent);
        color: var(--primary-color);
        font-weight: 600;
      }
    }

    .nav-icon {
      width: 1.25rem;
      text-align: center;
      flex-shrink: 0;
    }

    .shell-main {
      grid-area: main;
      padding: 1.5rem;
      overflow-y: auto;
      background: var(--surface-ground);
    }

    .shell-banner {
      margin-block-end: 1rem;
      padding: 0.75rem 1rem;
      border: 1px solid var(--surface-border);
      border-inline-start: 4px solid var(--primary-color);
      background: var(--surface-card);
      color: var(--text-color);
      font-size: 0.875rem;
      line-height: 1.4;
    }

    /* Responsive: collapse sidebar on small screens */
    @media (max-width: 768px) {
      .shell-layout {
        grid-template-areas:
          "topbar"
          "main";
        grid-template-columns: 1fr;
        grid-template-rows: 56px 1fr;
      }

      .topbar-menu-toggle {
        display: block;
      }

      .shell-sidebar {
        display: none;
        position: fixed;
        inset-block: 56px 0;
        inset-inline-start: 0;
        width: 240px;
        z-index: 99;
        box-shadow: 2px 0 8px rgba(0,0,0,0.15);
      }

      .shell-layout[data-sidebar-open="true"] .shell-sidebar {
        display: block;
      }
    }
  `],
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly locale = inject(LocaleService);
  protected readonly theme = inject(ThemeService);

  protected sidebarOpen = false;

  protected toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }
}
