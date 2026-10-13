import { AfterViewInit, Component } from '@angular/core';
import { ADSENSE_CLIENT, ADSENSE_SLOT } from '../../app.settings';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * Ένα responsive display ad του Google AdSense. Χωρίς ADSENSE_CLIENT/ADSENSE_SLOT
 * δεν αποδίδει τίποτα και δεν φορτώνει κανένα script της Google.
 *
 * Τη συγκατάθεση για cookies (GDPR) τη δείχνει το ίδιο το script του AdSense,
 * αρκεί να ενεργοποιηθεί το μήνυμα στο AdSense → Privacy & messaging.
 */
@Component({
  selector: 'app-ad-slot',
  standalone: true,
  template: `
    @if (enabled) {
      <p class="mb-1 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Διαφήμιση
      </p>
      <ins
        class="adsbygoogle block"
        [attr.data-ad-client]="client"
        [attr.data-ad-slot]="slot"
        data-ad-format="auto"
        data-full-width-responsive="true"
      ></ins>
    }
  `,
})
export class AdSlotComponent implements AfterViewInit {
  protected readonly client = ADSENSE_CLIENT;
  protected readonly slot = ADSENSE_SLOT;
  protected readonly enabled = Boolean(ADSENSE_CLIENT && ADSENSE_SLOT);

  ngAfterViewInit(): void {
    if (!this.enabled) return;
    loadAdSenseScript();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ad blocker ή ad unit που δεν γέμισε: η εφαρμογή συνεχίζει κανονικά.
    }
  }
}

function loadAdSenseScript(): void {
  if (document.querySelector('script[src*="adsbygoogle.js"]')) return;
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  document.head.appendChild(script);
}
