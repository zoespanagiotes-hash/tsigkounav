import { Component, computed, effect, inject, signal } from '@angular/core';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { AdSlotComponent } from './components/ad-slot/ad-slot.component';
import { AddressInputComponent } from './components/address-input/address-input.component';
import { DisclaimerDialogComponent } from './components/disclaimer-dialog/disclaimer-dialog.component';
import { MapComponent } from './components/map/map.component';
import { TOLL_DATA_FETCHED_AT } from './data/toll-stations';
import { AddressSuggestion, RouteResult, Stop, VehicleType } from './models/stop.model';
import { DEFAULT_FUEL_SETTINGS, calculateFuelCost } from './services/fuel.util';
import { formatCurrency, formatDistance, formatDuration } from './services/format.util';
import { RouteService } from './services/route.service';
import { decodeTrip, encodeTrip } from './services/share-url.util';
import { estimateTolls } from './services/toll.util';
import { ThemeService } from './services/theme.service';

const MAX_STOPS = 8;
const MIN_STOPS = 2;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AdSlotComponent, AddressInputComponent, DisclaimerDialogComponent, MapComponent],
  templateUrl: './app.html',
})
export class App {
  protected readonly theme = inject(ThemeService);
  private readonly routeService = inject(RouteService);

  protected readonly stops = signal<Stop[]>([this.emptyStop(), this.emptyStop()]);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly routeResult = signal<RouteResult | null>(null);
  /** Τα σημεία (με σειρά) που αντιστοιχούν στο τρέχον routeResult — για τις ετικέτες ανά σκέλος. */
  protected readonly routeStops = signal<Stop[]>([]);

  protected readonly readyStops = computed(() =>
    this.stops().filter((s) => s.lat !== null && s.lng !== null),
  );
  protected readonly canAddStop = computed(() => this.stops().length < MAX_STOPS);
  protected readonly canRemoveStop = computed(() => this.stops().length > MIN_STOPS);

  // --- Κόστος διαδρομής: καύσιμα + εκτίμηση διοδίων ---
  protected readonly consumption = signal(DEFAULT_FUEL_SETTINGS.consumptionLPer100Km);
  protected readonly fuelPrice = signal(DEFAULT_FUEL_SETTINGS.pricePerLiter);
  protected readonly includeTolls = signal(true);
  /** Ανά κενό μεταξύ διαδοχικών πεδίων του stops(): true = αποφυγή διοδίων σε αυτό το σκέλος. */
  protected readonly legAvoidTolls = signal<boolean[]>([false]);
  protected readonly allLegsAvoidTolls = computed(() => this.legAvoidTolls().every(Boolean));
  protected readonly someLegsAvoidTolls = computed(() => this.legAvoidTolls().some(Boolean));
  /**
   * Ανά σκέλος μεταξύ συμπληρωμένων σημείων (readyStops). Ένα τέτοιο σκέλος μπορεί
   * να καλύπτει και κενά πεδία: αποφεύγει διόδια αν ζητήθηκε σε κάποιο κομμάτι του.
   */
  private readonly readyLegAvoidTolls = computed(() => {
    const flags = this.legAvoidTolls();
    const readyIdx = this.stops().flatMap((s, i) => (s.lat !== null && s.lng !== null ? [i] : []));
    return readyIdx.slice(1).map((to, k) => flags.slice(readyIdx[k], to).some(Boolean));
  });
  protected readonly vehicle = signal<VehicleType>('car');
  protected readonly tollDataDate = TOLL_DATA_FETCHED_AT;

  protected readonly fuelCost = computed(() => {
    const result = this.routeResult();
    if (!result) return 0;
    return calculateFuelCost(result.distanceMeters, {
      consumptionLPer100Km: this.consumption(),
      pricePerLiter: this.fuelPrice(),
    });
  });

  protected readonly tollEstimate = computed(() => {
    const result = this.routeResult();
    if (!result) return { items: [], totalCost: 0 };
    return estimateTolls(result.coordinates, result.legs, this.vehicle());
  });

  protected readonly totalTripCost = computed(
    () => this.fuelCost() + (this.includeTolls() ? this.tollEstimate().totalCost : 0),
  );

  /** Η ίδια διαδρομή με διόδια παντού, για σύγκριση όταν κάποιο σκέλος τα αποφεύγει. */
  protected readonly tollRoute = signal<RouteResult | null>(null);

  /** Τι κερδίζει/χάνει ο χρήστης με την αποφυγή διοδίων, σε σχέση με τη διαδρομή με διόδια. */
  protected readonly tollComparison = computed(() => {
    const chosen = this.routeResult();
    const withTolls = this.tollRoute();
    if (!chosen || !withTolls) return null;
    const fuel = { consumptionLPer100Km: this.consumption(), pricePerLiter: this.fuelPrice() };
    const tollsSaved =
      estimateTolls(withTolls.coordinates, withTolls.legs, this.vehicle()).totalCost -
      this.tollEstimate().totalCost;
    const extraFuel =
      calculateFuelCost(chosen.distanceMeters, fuel) -
      calculateFuelCost(withTolls.distanceMeters, fuel);
    return {
      extraSeconds: chosen.durationSeconds - withTolls.durationSeconds,
      extraMeters: chosen.distanceMeters - withTolls.distanceMeters,
      tollsSaved,
      netSaving: tollsSaved - extraFuel,
    };
  });

  private routeSub?: Subscription;

  // --- Κοινοποίηση: η διαδρομή ζει στο URL ---
  /** Το query string της τρέχουσας διαδρομής (κενό αν δεν υπάρχει κανένα σημείο). */
  private readonly shareQuery = computed(() =>
    this.readyStops().length === 0
      ? ''
      : encodeTrip({
          stops: this.readyStops().map((s) => ({ lat: s.lat!, lng: s.lng!, label: s.label })),
          avoidTolls: this.readyLegAvoidTolls(),
          vehicle: this.vehicle(),
          consumption: this.consumption(),
          fuelPrice: this.fuelPrice(),
        }),
  );
  /** Μήνυμα επιβεβαίωσης δίπλα στο κουμπί share (π.χ. «Αντιγράφηκε!»). */
  protected readonly shareFeedback = signal<string | null>(null);
  private shareFeedbackTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.restoreFromUrl();
    // replaceState: η πλοήγηση "πίσω" δεν γεμίζει με κάθε αλλαγή του χρήστη.
    effect(() => {
      const query = this.shareQuery();
      const url = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
      if (url !== `${location.pathname}${location.search}${location.hash}`) {
        history.replaceState(history.state, '', url);
      }
    });
  }

  protected async share(): Promise<void> {
    const url = location.href;
    const names = this.routeStops().map((s) => s.label.split(',')[0]);
    const title = `TsigkouNav: ${names.join(' → ')}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.showShareFeedback('Ο σύνδεσμος αντιγράφηκε!');
    } catch (error) {
      // Ο χρήστης έκλεισε το μενού κοινοποίησης: δεν είναι σφάλμα.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.showShareFeedback('Δεν ήταν δυνατή η αντιγραφή. Αντέγραψε το URL από τη γραμμή διευθύνσεων.');
    }
  }

  private showShareFeedback(message: string): void {
    clearTimeout(this.shareFeedbackTimer);
    this.shareFeedback.set(message);
    this.shareFeedbackTimer = setTimeout(() => this.shareFeedback.set(null), 2500);
  }

  private restoreFromUrl(): void {
    const trip = decodeTrip(location.search);
    if (!trip) return;
    const stops: Stop[] = trip.stops.slice(0, MAX_STOPS).map((s) => ({
      id: crypto.randomUUID(),
      label: s.label,
      formattedAddress: s.label,
      lat: s.lat,
      lng: s.lng,
    }));
    while (stops.length < MIN_STOPS) stops.push(this.emptyStop());
    this.stops.set(stops);
    this.legAvoidTolls.set(stops.slice(1).map((_, i) => trip.avoidTolls[i] ?? false));
    this.vehicle.set(trip.vehicle);
    this.consumption.set(trip.consumption);
    this.fuelPrice.set(trip.fuelPrice);
    this.recalculate();
  }

  protected readonly formatDistance = formatDistance;
  protected readonly formatDuration = formatDuration;
  protected readonly formatCurrency = formatCurrency;
  protected readonly abs = Math.abs;

  protected setConsumption(value: string): void {
    const n = parseFloat(value.replace(',', '.'));
    if (!Number.isNaN(n) && n >= 0) this.consumption.set(n);
  }

  protected setFuelPrice(value: string): void {
    const n = parseFloat(value.replace(',', '.'));
    if (!Number.isNaN(n) && n >= 0) this.fuelPrice.set(n);
  }

  protected setVehicle(value: string): void {
    if (value === 'car' || value === 'motorcycle') this.vehicle.set(value);
  }

  protected toggleTolls(): void {
    this.includeTolls.update((v) => !v);
  }

  /** Αποφυγή διοδίων σε όλη τη διαδρομή (ή σε κανένα σκέλος). */
  protected setAvoidTollsEverywhere(avoid: boolean): void {
    this.legAvoidTolls.update((list) => list.map(() => avoid));
    this.recalculate();
  }

  /** Εναλλαγή διοδίων για το σκέλος από το πεδίο `index` στο επόμενο. */
  protected toggleLegTolls(index: number): void {
    this.legAvoidTolls.update((list) => list.map((v, i) => (i === index ? !v : v)));
    this.recalculate();
  }

  protected stopLabel(index: number, total: number): string {
    if (index === 0) return 'Αφετηρία';
    if (index === total - 1) return 'Προορισμός';
    return `Στάση ${index}`;
  }

  protected addStop(): void {
    if (!this.canAddStop()) return;
    this.stops.update((list) => [...list, this.emptyStop()]);
    // Αν όλη η διαδρομή αποφεύγει διόδια, το ίδιο και το νέο σκέλος.
    this.legAvoidTolls.update((list) => [...list, this.allLegsAvoidTolls()]);
  }

  protected removeStop(id: string): void {
    if (!this.canRemoveStop()) return;
    const index = this.stops().findIndex((s) => s.id === id);
    this.stops.update((list) => list.filter((s) => s.id !== id));
    // Τα δύο σκέλη γύρω από τη στάση γίνονται ένα: αποφεύγει διόδια αν το έκανε κάποιο από τα δύο.
    this.legAvoidTolls.update((list) => {
      const updated = [...list];
      if (index === 0) updated.shift();
      else if (index >= list.length) updated.pop();
      else updated.splice(index - 1, 2, list[index - 1] || list[index]);
      return updated;
    });
    this.recalculate();
  }

  protected moveStop(index: number, direction: -1 | 1): void {
    const target = index + direction;
    const list = this.stops();
    if (target < 0 || target >= list.length) return;
    const updated = [...list];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    this.stops.set(updated);
    this.recalculate();
  }

  protected onAddressSelected(id: string, suggestion: AddressSuggestion): void {
    this.stops.update((list) =>
      list.map((s) =>
        s.id === id
          ? {
              ...s,
              label: suggestion.label,
              formattedAddress: suggestion.label,
              lat: suggestion.lat,
              lng: suggestion.lng,
            }
          : s,
      ),
    );
    this.recalculate();
  }

  protected onAddressCleared(id: string): void {
    this.stops.update((list) =>
      list.map((s) => (s.id === id ? { ...s, lat: null, lng: null, formattedAddress: null } : s)),
    );
    this.recalculate();
  }

  protected clearAll(): void {
    this.routeSub?.unsubscribe();
    this.stops.set([this.emptyStop(), this.emptyStop()]);
    this.legAvoidTolls.set([false]);
    this.routeResult.set(null);
    this.tollRoute.set(null);
    this.routeStops.set([]);
    this.error.set(null);
    this.loading.set(false);
  }

  private recalculate(): void {
    const ready = this.readyStops();
    this.error.set(null);
    // Μια παλιότερη απάντηση δεν πρέπει να αντικαταστήσει τη νεότερη.
    this.routeSub?.unsubscribe();

    if (ready.length < 2) {
      this.routeResult.set(null);
      this.tollRoute.set(null);
      this.routeStops.set([]);
      this.loading.set(false);
      return;
    }

    const avoid = this.readyLegAvoidTolls();
    this.loading.set(true);
    this.routeSub = forkJoin({
      chosen: this.routeService.calculateRoute(ready, avoid),
      // Σύγκριση: μόνο αν αποφεύγουμε κάπου διόδια. Αν αποτύχει, απλώς δεν δείχνουμε σύγκριση.
      withTolls: avoid.some(Boolean)
        ? this.routeService.calculateRoute(ready).pipe(catchError(() => of(null)))
        : of(null),
    }).subscribe({
      next: ({ chosen, withTolls }) => {
        this.routeResult.set(chosen);
        this.tollRoute.set(withTolls);
        this.routeStops.set(ready);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Δεν ήταν δυνατός ο υπολογισμός της διαδρομής. Δοκίμασε ξανά σε λίγο.',
        );
        this.routeResult.set(null);
        this.tollRoute.set(null);
        this.routeStops.set([]);
        this.loading.set(false);
      },
    });
  }

  private emptyStop(): Stop {
    return {
      id: crypto.randomUUID(),
      label: '',
      formattedAddress: null,
      lat: null,
      lng: null,
    };
  }
}
