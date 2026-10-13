import { TOLL_STATIONS } from '../data/toll-stations';
import { RouteLeg, TollEstimate, VehicleType } from '../models/stop.model';
import { TollDirection, TollStation } from '../models/toll-station.model';

/**
 * Εντοπισμός σταθμών διοδίων πάνω στη γεωμετρία της διαδρομής.
 *
 * Τα δεδομένα (θέσεις + τιμές ανά σταθμό) και η λογική αντιστοίχισης
 * βασίζονται στο mydiodia.gr (CC BY 4.0). Σε γενικές γραμμές:
 *  1. Ένας σταθμός "βρίσκεται" στη διαδρομή αν απέχει λίγο από τη γραμμή της:
 *     έως ~2,5 χλμ για μετωπικούς/γέφυρες, έως ~130 μ. για πλευρικούς (ράμπες).
 *  2. Σταθμοί με δηλωμένη κατεύθυνση κρατιούνται μόνο αν η διαδρομή κινείται
 *     προς τα εκεί (αλλιώς είναι η ράμπα/πλατεία του αντίθετου ρεύματος).
 *  3. Δίκτυα με μία χρέωση (π.χ. Αττική Οδός) χρεώνονται μία φορά.
 *  4. Ένας πλευρικός σταθμός χρεώνεται μόνο αν είναι η είσοδος στον
 *     αυτοκινητόδρομο (πρώτος του) ή η έξοδος (τελευταίος του). Στη μέση
 *     απλώς τον προσπερνάμε από τον κεντρικό δρόμο.
 */

/** Κατώφλια απόστασης σε μοίρες lat/lng (όπως στο mydiodia). */
const FRONTAL_THRESHOLD_DEG = 0.025;
const SIDE_THRESHOLD_DEG = 0.0012;
/** Πλευρικοί σταθμοί σε απόσταση διαδρομής < 600 μ. θεωρούνται ο ίδιος κόμβος. */
const SAME_INTERCHANGE_KM = 0.6;

const DIRECTION_BEARING: Record<TollDirection, number> = {
  northbound: 0,
  eastbound: 90,
  southbound: 180,
  westbound: 270,
};

type LatLng = [number, number];

interface Match {
  station: TollStation;
  routeIdx: number;
  /** Πόσο καθαρά ταιριάζει η κατεύθυνση (μεγαλύτερο = καλύτερα). */
  dirMargin: number;
}

/**
 * Ο εντοπισμός γίνεται χωριστά για κάθε σκέλος (στάση → στάση) και τα
 * αποτελέσματα αθροίζονται. Έτσι σε μια διαδρομή με επιστροφή το ίδιο
 * διόδιο χρεώνεται και στο πήγαινε και στο έλα, ενώ η Αττική Οδός και οι
 * κανόνες των πλευρικών σταθμών εφαρμόζονται ανά ταξίδι.
 */
export function estimateTolls(
  coords: LatLng[],
  legs: RouteLeg[],
  vehicle: VehicleType,
): TollEstimate {
  const items = tollStationsOnRoute(coords, legs).map((station) => ({
    label: station.name,
    highway: station.highway,
    cost: station[vehicle],
  }));
  const totalCost = items.reduce((sum, item) => sum + item.cost, 0);
  return { items, totalCost };
}

/** Οι σταθμοί που χρεώνονται, με σειρά διέλευσης. Τα σκέλη `tollFree` παραλείπονται. */
export function tollStationsOnRoute(coords: LatLng[], legs: RouteLeg[]): TollStation[] {
  const billable: TollStation[] = [];
  let start = 0;
  for (const leg of legs) {
    if (!leg.tollFree) {
      const matches = tollsOnRoute(coords.slice(start, leg.endCoordIndex + 1));
      billable.push(...matches.map((m) => m.station));
    }
    start = leg.endCoordIndex;
  }
  return billable;
}

function tollsOnRoute(coords: LatLng[]): Match[] {
  if (coords.length < 2) return [];

  // 1–2. Χωρική αντιστοίχιση + έλεγχος κατεύθυνσης.
  const found: Match[] = [];
  for (const station of TOLL_STATIONS) {
    const p: LatLng = [station.lat, station.lng];
    const threshold = station.type === 'side' ? SIDE_THRESHOLD_DEG : FRONTAL_THRESHOLD_DEG;

    for (let i = 0; i < coords.length - 1; i++) {
      if (distToSegment(p, coords[i], coords[i + 1]) >= threshold) continue;

      let dirMargin = 0;
      if (station.direction) {
        const bearing = mainlineBearingAt(coords, i, station.role);
        const declared = DIRECTION_BEARING[station.direction];
        const dDeclared = angleDiff(bearing, declared);
        const dOpposite = angleDiff(bearing, (declared + 180) % 360);
        if (dDeclared >= dOpposite) break; // σταθμός του αντίθετου ρεύματος
        dirMargin = dOpposite - dDeclared;
      }
      found.push({ station, routeIdx: i, dirMargin });
      break;
    }
  }
  found.sort((a, b) => a.routeIdx - b.routeIdx);

  // Πλευρικοί του ίδιου κόμβου: ο οδηγός περνά μόνο από έναν — κρατάμε
  // αυτόν με την πιο καθαρή κατεύθυνση.
  const cumKm = cumulativeKm(coords);
  const deduped: Match[] = [];
  for (const match of found) {
    const prev = deduped.at(-1);
    if (
      prev &&
      match.station.type === 'side' &&
      prev.station.type === 'side' &&
      Math.abs(cumKm[match.routeIdx] - cumKm[prev.routeIdx]) < SAME_INTERCHANGE_KM
    ) {
      if (match.dirMargin > prev.dirMargin) deduped[deduped.length - 1] = match;
      continue;
    }
    deduped.push(match);
  }

  // 3. Μία χρέωση ανά δίκτυο ενιαίας χρέωσης.
  const seenGroups = new Set<string>();
  const capped = deduped.filter(({ station }) => {
    const group = station.chargeOnceGroup;
    if (!group) return true;
    if (seenGroups.has(group)) return false;
    seenGroups.add(group);
    return true;
  });

  // 4. Πλευρικοί: μόνο στην αρχή (είσοδος) ή στο τέλος (έξοδος) του
  // τμήματος της διαδρομής πάνω στον δικό τους αυτοκινητόδρομο.
  return capped.filter((match) => {
    const { station } = match;
    if (station.type !== 'side') return true;

    const sameHighway = capped.filter((m) => m.station.highway === station.highway);
    const pos = sameHighway.indexOf(match);
    const isFirst = pos === 0;
    const isLast = pos === sameHighway.length - 1;
    if (isFirst && isLast) return true;
    if (isFirst) return station.role === 'entry';
    if (isLast) return station.role === 'exit';
    return false;
  });
}

/** Απόσταση σημείου από ευθύγραμμο τμήμα, σε μοίρες (επίπεδη προσέγγιση). */
function distToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function bearingBetween(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * toRad) * Math.cos(b[0] * toRad);
  const x =
    Math.cos(a[0] * toRad) * Math.sin(b[0] * toRad) -
    Math.sin(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.cos((b[1] - a[1]) * toRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function approxKm(a: LatLng, b: LatLng): number {
  const dLat = (b[0] - a[0]) * 111.32;
  const dLng = (b[1] - a[1]) * 111.32 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function cumulativeKm(coords: LatLng[]): number[] {
  const cum = new Array<number>(coords.length).fill(0);
  for (let k = 1; k < coords.length; k++) cum[k] = cum[k - 1] + approxKm(coords[k - 1], coords[k]);
  return cum;
}

/**
 * Κατεύθυνση του κεντρικού δρόμου κοντά στον σταθμό. Οι ράμπες στρίβουν
 * προς κάθε κατεύθυνση, οπότε "περπατάμε" ~1 χλμ. πάνω στη διαδρομή:
 * μπροστά για ράμπες εισόδου, πίσω για εξόδους και μετωπικούς.
 */
function mainlineBearingAt(coords: LatLng[], idx: number, role?: 'entry' | 'exit'): number {
  const WALK_KM = 1.0;
  const MIN_KM = 0.15;
  const localBearing = () =>
    bearingBetween(coords[Math.max(0, idx - 2)], coords[Math.min(coords.length - 1, idx + 3)]);

  let j = idx;
  let acc = 0;
  if (role === 'entry') {
    while (j < coords.length - 1 && acc < WALK_KM) acc += approxKm(coords[j], coords[++j]);
    return acc < MIN_KM ? localBearing() : bearingBetween(coords[idx], coords[j]);
  }
  while (j > 0 && acc < WALK_KM) acc += approxKm(coords[j - 1], coords[j--]);
  return acc < MIN_KM ? localBearing() : bearingBetween(coords[j], coords[idx]);
}
