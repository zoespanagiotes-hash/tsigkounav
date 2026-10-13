/** Ένα σημείο (στάση) της διαδρομής. */
export interface Stop {
  /** Σταθερό αναγνωριστικό για tracking στο UI (δεν αλλάζει σε reorder). */
  id: string;
  /** Το κείμενο που εμφανίζεται/πληκτρολογεί ο χρήστης στο πεδίο αναζήτησης. */
  label: string;
  /** Η πλήρης διεύθυνση όπως επιστράφηκε από το geocoding, για εμφάνιση. */
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
}

/** Ένα αποτέλεσμα αναζήτησης διεύθυνσης (από Nominatim). */
export interface AddressSuggestion {
  label: string;
  lat: number;
  lng: number;
}

/** Αποτέλεσμα υπολογισμού διαδρομής (από OSRM). */
export interface RouteResult {
  /** Συνολική απόσταση σε μέτρα. */
  distanceMeters: number;
  /** Συνολική διάρκεια σε δευτερόλεπτα. */
  durationSeconds: number;
  /** Γεωμετρία διαδρομής ως λίστα [lat, lng] για σχεδίαση στον χάρτη. */
  coordinates: [number, number][];
  /** Ανάλυση ανά σκέλος (μεταξύ διαδοχικών στάσεων). */
  legs: RouteLeg[];
  /** Η διαδρομή περιλαμβάνει πορθμείο (π.χ. Ρίο–Αντίρριο αντί για τη γέφυρα). */
  hasFerry?: boolean;
}

/** Ένα σκέλος της διαδρομής, από μία στάση στην επόμενη. */
export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
  /** Δείκτης στο RouteResult.coordinates όπου τελειώνει το σκέλος (η στάση). */
  endCoordIndex: number;
  /** Υπολογίστηκε με αποφυγή διοδίων και επαληθεύτηκε: δεν χρεώνεται διόδια. */
  tollFree?: boolean;
}

/** Ρυθμίσεις κόστους καυσίμου, ορισμένες από τον χρήστη. */
export interface FuelSettings {
  /** Κατανάλωση σε λίτρα ανά 100 χλμ. */
  consumptionLPer100Km: number;
  /** Τιμή καυσίμου σε € ανά λίτρο. */
  pricePerLiter: number;
}

/** Κατηγορία οχήματος για τη χρέωση διοδίων. */
export type VehicleType = 'motorcycle' | 'car';

/** Ένας σταθμός διοδίων που χρεώνεται στη διαδρομή. */
export interface TollLineItem {
  label: string;
  /** Κωδικός αυτοκινητόδρομου (A1, A2, …). */
  highway: string;
  cost: number;
}

/** Συνολική εκτίμηση διοδίων για μια διαδρομή. */
export interface TollEstimate {
  items: TollLineItem[];
  totalCost: number;
}
