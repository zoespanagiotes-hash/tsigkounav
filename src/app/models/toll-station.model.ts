/** Κατεύθυνση κυκλοφορίας που χρεώνει ένας σταθμός. */
export type TollDirection = 'northbound' | 'southbound' | 'eastbound' | 'westbound';

/** Ένας σταθμός διοδίων (από τη βάση του mydiodia.gr). */
export interface TollStation {
  id: string;
  /** Όνομα σταθμού στα ελληνικά. */
  name: string;
  /** Κωδικός αυτοκινητόδρομου (A1, A2, …, E65, BRIDGE). */
  highway: string;
  /**
   * frontal: μετωπικός, χρεώνει όλους όσους περνούν.
   * side: πλευρικός, πάνω σε ράμπα εισόδου/εξόδου.
   * bridge: γέφυρα/σήραγγα.
   */
  type: 'frontal' | 'side' | 'bridge';
  /** Κατεύθυνση που χρεώνεται, αν ο σταθμός εξυπηρετεί μόνο μία. */
  direction?: TollDirection;
  /** Για πλευρικούς σταθμούς: ράμπα εισόδου ή εξόδου. */
  role?: 'entry' | 'exit';
  /** Δίκτυα με μία χρέωση ανά διαδρομή (π.χ. Αττική Οδός): χρεώνεται μόνο ο πρώτος σταθμός της ομάδας. */
  chargeOnceGroup?: string;
  lat: number;
  lng: number;
  /** Τιμή για μοτοσυκλέτα (κατηγορία 1), σε €. */
  motorcycle: number;
  /** Τιμή για επιβατικό ΙΧ (κατηγορία 2), σε €. */
  car: number;
}
