import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GEOAPIFY_API_KEY } from '../app.settings';
import { AddressSuggestion } from '../models/stop.model';

/**
 * Μετατρέπει κείμενο διεύθυνσης σε συντεταγμένες.
 *
 *  - Με GEOAPIFY_API_KEY: Geoapify Address Autocomplete (επιτρέπει autocomplete
 *    και εμπορική χρήση).
 *  - Χωρίς: το δωρεάν Nominatim (OpenStreetMap), μόνο για δοκιμές. Η πολιτική του
 *    δεν επιτρέπει autocomplete ούτε πάνω από 1 αίτημα/δευτερόλεπτο.
 *
 * Η αναζήτηση είναι biased προς Ελλάδα αλλά δεν την αποκλείει εντελώς,
 * ώστε να δουλεύουν και διευθύνσεις εξωτερικού.
 */
@Injectable({ providedIn: 'root' })
export class GeocodeService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://nominatim.openstreetmap.org/search';
  private readonly geoapifyUrl = 'https://api.geoapify.com/v1/geocode/autocomplete';

  /** Ελλάδα, χονδρικό bounding box: [minLon, maxLat, maxLon, minLat] */
  private readonly greeceViewbox = '19.0,42.1,29.7,34.7';

  search(query: string): Observable<AddressSuggestion[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      return new Observable((subscriber) => {
        subscriber.next([]);
        subscriber.complete();
      });
    }

    if (GEOAPIFY_API_KEY) return this.geoapifySearch(trimmed);

    const params = {
      q: trimmed,
      format: 'jsonv2',
      addressdetails: '0',
      limit: '5',
      viewbox: this.greeceViewbox,
      bounded: '0',
      'accept-language': 'el',
    };

    return this.http
      .get<NominatimResult[]>(this.baseUrl, { params })
      .pipe(
        map((results) =>
          results.map((r) => ({
            label: r.display_name,
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
          })),
        ),
      );
  }

  private geoapifySearch(text: string): Observable<AddressSuggestion[]> {
    const params = {
      text,
      format: 'json',
      limit: '5',
      bias: 'countrycode:gr',
      lang: 'el',
      apiKey: GEOAPIFY_API_KEY,
    };
    return this.http.get<GeoapifyAutocompleteResponse>(this.geoapifyUrl, { params }).pipe(
      map((res) =>
        res.results.map((r) => ({
          label: r.formatted,
          lat: r.lat,
          lng: r.lon,
        })),
      ),
    );
  }
}

interface GeoapifyAutocompleteResponse {
  results: { formatted: string; lat: number; lon: number }[];
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}
