import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { AddressSuggestion } from '../../models/stop.model';
import { GeocodeService } from '../../services/geocode.service';

/**
 * Πεδίο αναζήτησης διεύθυνσης με autocomplete (μέσω Nominatim).
 * Ξεκινάει άδειο· ο χρήστης πληκτρολογεί και διαλέγει από τη λίστα.
 */
@Component({
  selector: 'app-address-input',
  standalone: true,
  templateUrl: './address-input.component.html',
})
export class AddressInputComponent implements OnInit {
  readonly placeholder = input('Διεύθυνση...');
  readonly disabled = input(false);
  /** Αρχικό κείμενο (π.χ. σημείο που ήρθε από κοινοποιημένο σύνδεσμο). Δεν ξεκινά αναζήτηση. */
  readonly initialValue = input('');

  /** Εκπέμπεται όταν ο χρήστης διαλέξει μια πρόταση από τη λίστα. */
  readonly selected = output<AddressSuggestion>();
  /** Εκπέμπεται όταν ο χρήστης αδειάσει το πεδίο (ακυρώνει το σημείο). */
  readonly cleared = output<void>();

  protected readonly query = signal('');
  protected readonly suggestions = signal<AddressSuggestion[]>([]);
  protected readonly isOpen = signal(false);
  protected readonly isLoading = signal(false);

  private readonly geocode = inject(GeocodeService);
  private readonly host = inject(ElementRef<HTMLElement>);
  /** Όταν επιλέγεται μια πρόταση, το query.set() που ακολουθεί δεν πρέπει να ξανα-ψάξει. */
  private skipNextSearch = false;

  constructor() {
    toObservable(this.query)
      .pipe(
        debounceTime(350),
        distinctUntilChanged(),
        filter(() => {
          if (this.skipNextSearch) {
            this.skipNextSearch = false;
            return false;
          }
          return true;
        }),
        tap((q) => this.isLoading.set(q.trim().length >= 3)),
        switchMap((q) => this.geocode.search(q).pipe(catchError(() => of([])))),
      )
      .subscribe((results) => {
        this.suggestions.set(results);
        this.isLoading.set(false);
        this.isOpen.set(results.length > 0);
      });
  }

  ngOnInit(): void {
    if (this.initialValue()) {
      this.skipNextSearch = true;
      this.query.set(this.initialValue());
    }
  }

  onInput(value: string): void {
    this.query.set(value);
    if (!value.trim()) {
      this.suggestions.set([]);
      this.isOpen.set(false);
      this.cleared.emit();
    }
  }

  onFocus(): void {
    if (this.suggestions().length > 0) {
      this.isOpen.set(true);
    }
  }

  choose(s: AddressSuggestion): void {
    this.skipNextSearch = true;
    this.query.set(s.label);
    this.isOpen.set(false);
    this.suggestions.set([]);
    this.selected.emit(s);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.isOpen.set(false);
    }
  }
}
