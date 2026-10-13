import { DEFAULT_FUEL_SETTINGS } from './fuel.util';
import { SharedTrip, decodeTrip, encodeTrip } from './share-url.util';

describe('share-url.util', () => {
  const trip: SharedTrip = {
    stops: [
      { lat: 37.98381, lng: 23.72754, label: 'Αθήνα, Δήμος Αθηναίων' },
      { lat: 40.64012, lng: 22.94441, label: 'Θεσσαλονίκη' },
      { lat: 41.1171, lng: 25.4053, label: 'Ξάνθη' },
    ],
    avoidTolls: [false, true],
    vehicle: 'motorcycle',
    consumption: 4.5,
    fuelPrice: 1.92,
  };

  it('round-trips a trip through the URL', () => {
    expect(decodeTrip(encodeTrip(trip))).toEqual(trip);
  });

  it('keeps the URL short for default settings', () => {
    const query = encodeTrip({
      ...trip,
      avoidTolls: [false, false],
      vehicle: 'car',
      consumption: DEFAULT_FUEL_SETTINGS.consumptionLPer100Km,
      fuelPrice: DEFAULT_FUEL_SETTINGS.pricePerLiter,
    });
    expect(query).not.toMatch(/nt=|v=|c=|f=/);
  });

  it('shortens long addresses to their first parts', () => {
    const query = encodeTrip({
      ...trip,
      stops: [{ lat: 38, lng: 23, label: 'Οδός 1, Περιοχή, Δήμος, Νομός, 12345, Ελλάδα' }],
    });
    expect(decodeTrip(query)?.stops[0].label).toBe('Οδός 1, Περιοχή');
  });

  it('ignores invalid points and returns null when none is valid', () => {
    expect(decodeTrip('?p=abc,1,X&p=95,10,Y')).toBeNull();
    expect(decodeTrip('')).toBeNull();
    expect(decodeTrip('?p=38,23,A&p=oops&p=39,23,B')?.stops.map((s) => s.label)).toEqual(['A', 'B']);
  });
});
