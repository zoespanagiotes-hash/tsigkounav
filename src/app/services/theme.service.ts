import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'tsigkou-nav-theme';

/** Διαχειρίζεται light/dark mode με persistence στο localStorage. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDark = signal(this.readInitial());

  constructor() {
    effect(() => {
      const dark = this.isDark();
      document.documentElement.classList.toggle('dark', dark);
      try {
        localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
      } catch {
        /* localStorage μπορεί να μην είναι διαθέσιμο (π.χ. private mode) */
      }
    });
  }

  toggle(): void {
    this.isDark.update((v) => !v);
  }

  private readInitial(): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark') return true;
      if (stored === 'light') return false;
    } catch {
      /* ignore */
    }
    return (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
    );
  }
}
