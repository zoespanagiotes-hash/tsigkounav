import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concat, map, throwError, toArray } from 'rxjs';
import { GEOAPIFY_API_KEY } from '../app.settings';
import { RouteResult, Stop } from '../models/stop.model';

/**
 * Υπολογίζει διαδρομή οδήγησης μεταξύ διαδοχικών σημείων.
 *
 * Με GEOAPIFY_API_KEY όλα τα σκέλη πάνε στο Geoapify Routing (`avoid=tolls` για
 * όσα αποφεύγουν διόδια). Χωρίς κλειδί, δημόσιοι servers χωρίς API key:
 *  - Σκέλη με διόδια: OSRM demo server (router.project-osrm.org).
 *  - Σκέλη χωρίς διόδια: Valhalla server της FOSSGIS
 *    (valhalla1.openstreetmap.de), που αποκλείει δρόμους με διόδια βάσει OSM.
 *    Το OSRM demo δεν υποστηρίζει `exclude=toll`.
 *
 * Σημείωση: οι δημόσιοι servers προορίζονται για δοκιμές/μικρή χρήση, όχι
 * για εμπορική ή βαριά production κίνηση.
 */
@Injectable({ providedIn: 'root' })
export class RouteService {
  private readonly http = inject(HttpClient);
  private readonly osrmUrl = 'https://router.project-osrm.org/route/v1/driving';
  private readonly valhallaUrl = 'https://valhalla1.openstreetmap.de/route';
  private readonly geoapifyUrl = 'https://api.geoapify.com/v1/routing';

  /**
   * Στα stops αναμένονται ήδη γεωκωδικοποιημένα σημεία (lat/lng != null), με σειρά διαδρομής.
   * `avoidTolls[i]` αφορά το σκέλος stops[i] → stops[i + 1] (ελλείπον = με διόδια).
   */
  calculateRoute(stops: Stop[], avoidTolls: boolean[] = []): Observable<RouteResult> {
    // Διαδοχικά σκέλη με την ίδια επιλογή ζητούνται μαζί, σε ένα αίτημα.
    const segments: { from: number; to: number; avoid: boolean }[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const avoid = avoidTolls[i] ?? false;
      const last = segments.at(-1);
      if (last && last.avoid === avoid) last.to = i + 1;
      else segments.push({ from: i, to: i + 1, avoid });
    }

    // Σειριακά, για να μη χτυπάμε τον server με παράλληλα αιτήματα.
    return concat(
      ...segments.map(({ from, to, avoid }) => {
        const segmentStops = stops.slice(from, to + 1);
        if (GEOAPIFY_API_KEY && !avoid) return this.geoapifyRoute(segmentStops, false);
        if (!avoid) return this.osrmRoute(segmentStops);
        const route$ = GEOAPIFY_API_KEY
          ? this.geoapifyRoute(segmentStops, true)
          : this.valhallaRoute(segmentStops);
        return route$.pipe(
          catchError((error: unknown) => {
            const label = segments.length > 1 ? ` για το σκέλος ${from + 1} → ${to + 1}` : '';
            return throwError(() =>
              error instanceof NoTollFreeRouteError ||
              (error instanceof HttpErrorResponse && error.status === 400)
                ? new Error(
                    `Δεν βρέθηκε διαδρομή χωρίς διόδια${label}. Επίλεξε διαδρομή με διόδια γι' αυτό το κομμάτι.`,
                  )
                : error,
            );
          }),
        );
      }),
    ).pipe(toArray(), map(mergeRoutes));
  }

  private osrmRoute(stops: Stop[]): Observable<RouteResult> {
    const coords = stops.map((s) => `${s.lng},${s.lat}`).join(';');
    const params = {
      // Πλήρης γεωμετρία: χρειάζεται για τον εντοπισμό σταθμών διοδίων.
      overview: 'full',
      geometries: 'geojson',
      // Ένα στοιχείο ανά τμήμα της γεωμετρίας κάθε σκέλους: από το πλήθος
      // βρίσκουμε πού τελειώνει κάθε σκέλος μέσα στο coordinates.
      annotations: 'distance',
    };

    return this.http.get<OsrmResponse>(`${this.osrmUrl}/${coords}`, { params }).pipe(
      map((res) => {
        if (res.code !== 'Ok' || !res.routes?.length) {
          throw new Error('Δεν βρέθηκε διαδρομή μεταξύ των σημείων.');
        }
        return fromOsrm(res.routes[0]);
      }),
    );
  }

  /**
   * Διαδρομή που αποκλείει δρόμους με διόδια (tags του OSM). Τα σκέλη της
   * σημειώνονται `tollFree`: ο δικός μας εκτιμητής δεν τρέχει σε αυτά, γιατί
   * με κατώφλι ~2,5 χλμ. για μετωπικούς σταθμούς "βλέπει" ψευδώς διόδια
   * σε παράλληλους δρόμους (π.χ. παλιά εθνική δίπλα στην Ολυμπία Οδό).
   */
  private valhallaRoute(stops: Stop[]): Observable<RouteResult> {
    const body = {
      locations: stops.map((s) => ({ lat: s.lat, lon: s.lng })),
      costing: 'auto',
      costing_options: { auto: { exclude_tolls: true } },
      directions_type: 'none',
      units: 'kilometers',
    };
    return this.http.post<ValhallaResponse>(this.valhallaUrl, body).pipe(map(fromValhalla));
  }

  /**
   * Το `avoid=tolls` του Geoapify είναι προτίμηση: αν δεν υπάρχει άλλος δρόμος,
   * επιστρέφει διαδρομή με διόδια. Τότε τη θεωρούμε αποτυχία, όπως το 400 του Valhalla.
   */
  private geoapifyRoute(stops: Stop[], avoidTolls: boolean): Observable<RouteResult> {
    const params: Record<string, string> = {
      waypoints: stops.map((s) => `${s.lat},${s.lng}`).join('|'),
      mode: 'drive',
      apiKey: GEOAPIFY_API_KEY,
    };
    if (avoidTolls) params['avoid'] = 'tolls';

    return this.http.get<GeoapifyResponse>(this.geoapifyUrl, { params }).pipe(
      map((res) => {
        const feature = res.features?.[0];
        if (!feature) throw new Error('Δεν βρέθηκε διαδρομή μεταξύ των σημείων.');
        if (avoidTolls && feature.properties.toll) throw new NoTollFreeRouteError();
        return fromGeoapify(feature, avoidTolls);
      }),
    );
  }
}

class NoTollFreeRouteError extends Error {}

/** Ενώνει διαδοχικά τμήματα διαδρομής σε ένα RouteResult. */
function mergeRoutes(parts: RouteResult[]): RouteResult {
  const merged: RouteResult = { distanceMeters: 0, durationSeconds: 0, coordinates: [], legs: [] };
  for (const part of parts) {
    // Το πρώτο σημείο κάθε τμήματος είναι η στάση όπου τελείωσε το προηγούμενο.
    const offset = Math.max(0, merged.coordinates.length - 1);
    merged.coordinates.push(...(merged.coordinates.length ? part.coordinates.slice(1) : part.coordinates));
    merged.legs.push(...part.legs.map((leg) => ({ ...leg, endCoordIndex: leg.endCoordIndex + offset })));
    merged.distanceMeters += part.distanceMeters;
    merged.durationSeconds += part.durationSeconds;
    merged.hasFerry ||= part.hasFerry;
  }
  return merged;
}

function fromOsrm(route: OsrmResponse['routes'][number]): RouteResult {
  let endCoordIndex = 0;
  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    legs: route.legs.map((leg) => ({
      distanceMeters: leg.distance,
      durationSeconds: leg.duration,
      endCoordIndex: (endCoordIndex += leg.annotation.distance.length),
    })),
  };
}

function fromValhalla(res: ValhallaResponse): RouteResult {
  const coordinates: [number, number][] = [];
  const legs = res.trip.legs.map((leg) => {
    const shape = decodePolyline6(leg.shape);
    coordinates.push(...(coordinates.length ? shape.slice(1) : shape));
    return {
      distanceMeters: leg.summary.length * 1000,
      durationSeconds: leg.summary.time,
      endCoordIndex: coordinates.length - 1,
      tollFree: true,
    };
  });
  return {
    distanceMeters: res.trip.summary.length * 1000,
    durationSeconds: res.trip.summary.time,
    coordinates,
    legs,
    hasFerry: res.trip.summary.has_ferry,
  };
}

/** Το geometry είναι MultiLineString με μία γραμμή [lng, lat] ανά σκέλος. */
function fromGeoapify(feature: GeoapifyFeature, tollFree: boolean): RouteResult {
  const coordinates: [number, number][] = [];
  const legs = feature.properties.legs.map((leg, i) => {
    const line = feature.geometry.coordinates[i].map(([lng, lat]) => [lat, lng] as [number, number]);
    coordinates.push(...(coordinates.length ? line.slice(1) : line));
    return {
      distanceMeters: leg.distance,
      durationSeconds: leg.time,
      endCoordIndex: coordinates.length - 1,
      ...(tollFree && { tollFree: true }),
    };
  });
  return {
    distanceMeters: feature.properties.distance,
    durationSeconds: feature.properties.time,
    coordinates,
    legs,
    hasFerry: feature.properties.ferry ?? false,
  };
}

/** Αποκωδικοποίηση encoded polyline με ακρίβεια 6 ψηφίων (μορφή Valhalla) σε [lat, lng]. */
export function decodePolyline6(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push([lat / 1e6, lng / 1e6]);
  }
  return points;
}

interface OsrmLeg {
  distance: number;
  duration: number;
  annotation: { distance: number[] };
}

interface OsrmResponse {
  code: string;
  routes: {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
    legs: OsrmLeg[];
  }[];
}

interface ValhallaSummary {
  /** Χιλιόμετρα (units: kilometers). */
  length: number;
  /** Δευτερόλεπτα. */
  time: number;
  has_ferry: boolean;
}

interface GeoapifyFeature {
  properties: {
    /** Μέτρα. */
    distance: number;
    /** Δευτερόλεπτα. */
    time: number;
    toll?: boolean;
    ferry?: boolean;
    legs: { distance: number; time: number }[];
  };
  geometry: { coordinates: [number, number][][] };
}

interface GeoapifyResponse {
  features: GeoapifyFeature[];
}

interface ValhallaResponse {
  trip: {
    summary: ValhallaSummary;
    legs: { summary: ValhallaSummary; shape: string }[];
  };
}
