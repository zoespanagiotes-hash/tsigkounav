import { VehicleType } from '../models/stop.model';
import { DEFAULT_FUEL_SETTINGS } from './fuel.util';

/**
 * Η διαδρομή όπως μπαίνει στο URL, ώστε να μπορεί να σταλεί σε κάποιον άλλο.
 *
 * Μορφή (μόνο ό,τι διαφέρει από τις προεπιλογές):
 *   ?p=37.98380,23.72750,Αθήνα&p=40.64010,22.94440,Θεσσαλονίκη  σημεία με σειρά
 *   &nt=01        ανά σκέλος: 1 = χωρίς διόδια
 *   &v=moto       όχημα
 *   &c=6.5&f=1.85 κατανάλωση (L/100km), τιμή καυσίμου (€/L)
 */
export interface SharedTrip {
  stops: { lat: number; lng: number; label: string }[];
  avoidTolls: boolean[];
  vehicle: VehicleType;
  consumption: number;
  fuelPrice: number;
}

/** Οι διευθύνσεις του Nominatim είναι μακροσκελείς· στο URL κρατάμε τα πρώτα μέρη τους. */
const LABEL_PARTS = 2;

export function encodeTrip(trip: SharedTrip): string {
  const params = new URLSearchParams();
  for (const s of trip.stops) {
    const label = s.label.split(',').slice(0, LABEL_PARTS).join(',').trim();
    params.append('p', `${s.lat.toFixed(5)},${s.lng.toFixed(5)},${label}`);
  }
  if (trip.avoidTolls.some(Boolean)) {
    params.set('nt', trip.avoidTolls.map((a) => (a ? '1' : '0')).join(''));
  }
  if (trip.vehicle === 'motorcycle') params.set('v', 'moto');
  if (trip.consumption !== DEFAULT_FUEL_SETTINGS.consumptionLPer100Km) {
    params.set('c', String(trip.consumption));
  }
  if (trip.fuelPrice !== DEFAULT_FUEL_SETTINGS.pricePerLiter) {
    params.set('f', String(trip.fuelPrice));
  }
  // Τα κόμματα είναι έγκυρα σε query string· χωρίς %2C ο σύνδεσμος διαβάζεται πιο εύκολα.
  return params.toString().replaceAll('%2C', ',');
}

/** Επιστρέφει null αν το URL δεν περιέχει (έγκυρα) σημεία. */
export function decodeTrip(search: string): SharedTrip | null {
  const params = new URLSearchParams(search);

  const stops: SharedTrip['stops'] = [];
  for (const raw of params.getAll('p')) {
    // Το label μπορεί να περιέχει κόμματα: χωρίζουμε μόνο στα δύο πρώτα.
    const [latText, lngText, ...rest] = raw.split(',');
    const lat = Number(latText);
    const lng = Number(lngText);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const label = rest.join(',').trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    stops.push({ lat, lng, label });
  }
  if (stops.length === 0) return null;

  const nt = params.get('nt') ?? '';
  const positive = (key: string, fallback: number) => {
    const n = Number(params.get(key));
    return params.has(key) && isFinite(n) && n >= 0 ? n : fallback;
  };

  return {
    stops,
    avoidTolls: stops.slice(1).map((_, i) => nt[i] === '1'),
    vehicle: params.get('v') === 'moto' ? 'motorcycle' : 'car',
    consumption: positive('c', DEFAULT_FUEL_SETTINGS.consumptionLPer100Km),
    fuelPrice: positive('f', DEFAULT_FUEL_SETTINGS.pricePerLiter),
  };
}
