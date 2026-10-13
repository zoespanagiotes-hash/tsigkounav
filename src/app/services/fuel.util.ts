import { FuelSettings } from '../models/stop.model';

/** Λογικά default: μέσος όρος βενζινοκίνητου ΙΧ και τρέχουσα μέση τιμή αμόλυβδης. */
export const DEFAULT_FUEL_SETTINGS: FuelSettings = {
  consumptionLPer100Km: 7.5,
  pricePerLiter: 2.19,
};

/**
 * Κόστος καυσίμου = (χιλιόμετρα / 100) × κατανάλωση (L/100km) × τιμή (€/L).
 */
export function calculateFuelCost(distanceMeters: number, settings: FuelSettings): number {
  const km = distanceMeters / 1000;
  return (km / 100) * settings.consumptionLPer100Km * settings.pricePerLiter;
}
