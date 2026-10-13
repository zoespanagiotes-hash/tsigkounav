import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';

const STORAGE_KEY = 'tsigkou-nav-disclaimer-seen';

/**
 * Ειδοποίηση ότι η εφαρμογή φτιάχτηκε με vibe coding. Ανοίγει αυτόματα στην
 * πρώτη επίσκεψη και μετά μόνο με open() (κουμπί ℹ️ στο header).
 * Native <dialog>: Esc, focus trap και top layer (πάνω από τον χάρτη) δωρεάν.
 */
@Component({
  selector: 'app-disclaimer-dialog',
  standalone: true,
  templateUrl: './disclaimer-dialog.component.html',
})
export class DisclaimerDialogComponent implements AfterViewInit {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  ngAfterViewInit(): void {
    if (!this.hasBeenSeen()) this.open();
  }

  open(): void {
    const el = this.dialog().nativeElement;
    if (!el.open) el.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  /** Καλείται σε κάθε κλείσιμο (κουμπί, Esc ή κλικ έξω). */
  protected onClosed(): void {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* localStorage μπορεί να μην είναι διαθέσιμο (π.χ. private mode) */
    }
  }

  /** Κλικ στο backdrop: το event target είναι το ίδιο το <dialog>. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  private hasBeenSeen(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
