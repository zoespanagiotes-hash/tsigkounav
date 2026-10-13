/**
 * Ρυθμίσεις τρίτων υπηρεσιών. Τα κλειδιά καταλήγουν στον browser, άρα δεν είναι
 * μυστικά: περιόρισέ τα στο domain σου από το dashboard κάθε υπηρεσίας.
 */

/**
 * API key του Geoapify (https://myprojects.geoapify.com/), για διαδρομές,
 * αναζήτηση διευθύνσεων και χάρτη. Το δωρεάν πλάνο επιτρέπει εμπορική χρήση.
 * Κενό = οι δημόσιοι δωρεάν servers (OSRM, Valhalla, Nominatim, OSM tiles),
 * που κάνουν μόνο για δοκιμές και όχι για εμπορικό site με διαφημίσεις.
 */
export const GEOAPIFY_API_KEY = '1796cf9ed5a54bc096b6aa6958de99c8';

/**
 * Google AdSense. Κενά = δεν φορτώνεται τίποτα από τη Google.
 *  - client: το publisher ID, π.χ. 'ca-pub-1234567890123456'
 *  - slot: το ID ενός ad unit (AdSense → Ads → By ad unit → Display ads)
 */
export const ADSENSE_CLIENT = '';
export const ADSENSE_SLOT = '';
