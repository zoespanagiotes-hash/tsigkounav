import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { GEOAPIFY_API_KEY } from '../../app.settings';
import { RouteResult, Stop } from '../../models/stop.model';

/** Χρώμα ανά ρόλο σημείου: αφετηρία, ενδιάμεσο, προορισμός. */
const MARKER_COLORS = {
  start: '#16a34a', // green-600
  mid: '#2563eb', // blue-600
  end: '#dc2626', // red-600
};

@Component({
  selector: 'app-map',
  standalone: true,
  template: `<div #mapContainer class="h-full w-full"></div>`,
})
export class MapComponent implements AfterViewInit, OnDestroy {
  readonly stops = input<Stop[]>([]);
  readonly route = input<RouteResult | null>(null);

  private readonly mapContainer =
    viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');

  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup | null = null;
  private routeLayer: L.FeatureGroup | null = null;

  constructor() {
    // Ξανασχεδιάζει markers/route κάθε φορά που αλλάζουν τα inputs.
    effect(() => {
      const stops = this.stops();
      const route = this.route();
      if (this.map) {
        this.render(stops, route);
      }
    });
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapContainer().nativeElement, {
      zoomControl: true,
    }).setView([38.05, 23.78], 7); // κέντρο περίπου στην Ελλάδα (Αθήνα)

    // Τα tiles του OSM δεν επιτρέπουν μεγάλη κίνηση: με κλειδί, tiles του Geoapify.
    const osmAttribution =
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> συντελεστές';
    if (GEOAPIFY_API_KEY) {
      L.tileLayer(
        `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${GEOAPIFY_API_KEY}`,
        {
          attribution: `Powered by <a href="https://www.geoapify.com/">Geoapify</a> | &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ${osmAttribution}`,
          maxZoom: 20,
        },
      ).addTo(this.map);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: osmAttribution,
        maxZoom: 19,
      }).addTo(this.map);
    }

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.render(this.stops(), this.route());

    // Το leaflet μπορεί να υπολογίσει λάθος μέγεθος αν αρχικοποιήθηκε
    // πριν φανεί ο container (π.χ. flex layout). Το διορθώνουμε άμεσα.
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
  }

  private render(stops: Stop[], route: RouteResult | null): void {
    if (!this.map || !this.markersLayer) return;

    this.markersLayer.clearLayers();
    const located = stops.filter(
      (s): s is Stop & { lat: number; lng: number } =>
        s.lat !== null && s.lng !== null,
    );

    located.forEach((stop, index) => {
      const role =
        index === 0 ? 'start' : index === located.length - 1 ? 'end' : 'mid';
      const color = MARKER_COLORS[role];
      const icon = L.divIcon({
        className: '',
        html: `<div style="
            background:${color};
            color:#fff;
            width:28px;
            height:28px;
            border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            display:flex;
            align-items:center;
            justify-content:center;
            box-shadow:0 1px 4px rgba(0,0,0,.4);
            border:2px solid #fff;
          ">
            <span style="transform:rotate(45deg);font-size:12px;font-weight:700;">${index + 1}</span>
          </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
      });

      L.marker([stop.lat, stop.lng], { icon })
        .bindPopup(stop.formattedAddress ?? stop.label)
        .addTo(this.markersLayer!);
    });

    if (this.routeLayer) {
      this.map.removeLayer(this.routeLayer);
      this.routeLayer = null;
    }

    if (route && route.coordinates.length > 1) {
      // Ένα κομμάτι γραμμής ανά σκέλος: πράσινο όσα αποφεύγουν τα διόδια.
      let start = 0;
      const lines = route.legs.map((leg) => {
        const line = L.polyline(route.coordinates.slice(start, leg.endCoordIndex + 1), {
          color: leg.tollFree ? MARKER_COLORS.start : '#2563eb',
          weight: 5,
          opacity: 0.85,
        });
        start = leg.endCoordIndex;
        return line;
      });
      this.routeLayer = L.featureGroup(lines).addTo(this.map);
      this.map.fitBounds(this.routeLayer.getBounds(), { padding: [40, 40] });
    } else if (located.length > 0) {
      const bounds = L.latLngBounds(located.map((s) => [s.lat, s.lng]));
      if (located.length === 1) {
        this.map.setView(bounds.getCenter(), 12);
      } else {
        this.map.fitBounds(bounds, { padding: [40, 40] });
      }
    }
  }
}
