/** Μορφοποιεί μέτρα σε km με κατάλληλη ακρίβεια, στα ελληνικά. */
export function formatDistance(meters: number): string {
  const km = meters / 1000;
  const value = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  return `${value.replace('.', ',')} χλμ`;
}

/** Μορφοποιεί ποσό σε ευρώ, στα ελληνικά (π.χ. "12,40 €"). */
export function formatCurrency(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

/** Μορφοποιεί δευτερόλεπτα σε "Χ ώρες Υ λεπτά", στα ελληνικά. */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} λεπτά`;
  }
  const hourLabel = hours === 1 ? 'ώρα' : 'ώρες';
  if (minutes === 0) {
    return `${hours} ${hourLabel}`;
  }
  return `${hours} ${hourLabel} ${minutes} λεπτά`;
}
