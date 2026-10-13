import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RouteResult, Stop } from '../models/stop.model';
import { RouteService, decodePolyline6 } from './route.service';

describe('RouteService', () => {
  let service: RouteService;
  let httpTesting: HttpTestingController;

  const stops: Stop[] = [
    { id: 'a', label: 'A', formattedAddress: null, lat: 38, lng: 24 },
    { id: 'b', label: 'B', formattedAddress: null, lat: 39, lng: 24 },
    { id: 'c', label: 'C', formattedAddress: null, lat: 40, lng: 24 },
  ];
  const osrmCoords: [number, number][] = [
    [38, 24],
    [38.5, 24],
    [39, 24],
  ];
  const valhallaCoords: [number, number][] = [
    [39, 24],
    [39.5, 23.9],
    [40, 24],
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RouteService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('uses OSRM when tolls are allowed', () => {
    let result: RouteResult | undefined;
    service.calculateRoute(stops.slice(0, 2)).subscribe((r) => (result = r));

    httpTesting.expectOne((req) => req.url.includes('/route/v1/driving/')).flush(osrmResponse(osrmCoords));

    expect(result?.coordinates).toEqual(osrmCoords);
    expect(result?.legs[0].tollFree).toBeFalsy();
  });

  it('uses Valhalla with exclude_tolls and marks legs toll-free when avoiding tolls', () => {
    let result: RouteResult | undefined;
    service.calculateRoute(stops.slice(1), [true]).subscribe((r) => (result = r));

    const req = httpTesting.expectOne((r) => r.url.includes('valhalla'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body.costing_options.auto.exclude_tolls).toBeTrue();
    req.flush(valhallaResponse([valhallaCoords]));

    expect(result?.coordinates).toEqual(valhallaCoords);
    expect(result?.legs[0].tollFree).toBeTrue();
    expect(result?.distanceMeters).toBe(100_000);
  });

  it('routes each leg with the chosen option and merges them in order', () => {
    let result: RouteResult | undefined;
    service.calculateRoute(stops, [false, true]).subscribe((r) => (result = r));

    httpTesting.expectOne((req) => req.url.includes('/route/v1/driving/')).flush(osrmResponse(osrmCoords));
    httpTesting.expectOne((r) => r.url.includes('valhalla')).flush(valhallaResponse([valhallaCoords]));

    // Το κοινό σημείο (στάση B) εμφανίζεται μία φορά.
    expect(result?.coordinates).toEqual([...osrmCoords, ...valhallaCoords.slice(1)]);
    expect(result?.legs.map((l) => l.endCoordIndex)).toEqual([2, 4]);
    expect(result?.legs.map((l) => !!l.tollFree)).toEqual([false, true]);
    expect(result?.distanceMeters).toBe(110_000);
  });

  it('reports a clear error when no toll-free route exists', () => {
    let error: Error | undefined;
    service.calculateRoute(stops.slice(0, 2), [true]).subscribe({ error: (e: Error) => (error = e) });

    httpTesting
      .expectOne((r) => r.url.includes('valhalla'))
      .flush({ error_code: 442, error: 'No path could be found' }, { status: 400, statusText: 'Bad Request' });

    expect(error?.message).toContain('χωρίς διόδια');
  });

  it('decodes polyline6 shapes', () => {
    expect(decodePolyline6(encodePolyline6(valhallaCoords))).toEqual(valhallaCoords);
  });

  function osrmResponse(coordinates: [number, number][]) {
    return {
      code: 'Ok',
      routes: [
        {
          distance: 10_000,
          duration: 900,
          geometry: { coordinates: coordinates.map(([lat, lng]) => [lng, lat]) },
          legs: [
            {
              distance: 10_000,
              duration: 900,
              annotation: { distance: Array(coordinates.length - 1).fill(1) },
            },
          ],
        },
      ],
    };
  }

  function valhallaResponse(legShapes: [number, number][][]) {
    const summary = { length: 100, time: 3600, has_ferry: false };
    return {
      trip: {
        summary,
        legs: legShapes.map((shape) => ({ summary, shape: encodePolyline6(shape) })),
      },
    };
  }

  function encodePolyline6(points: [number, number][]): string {
    let out = '';
    let prevLat = 0;
    let prevLng = 0;
    const encode = (value: number) => {
      let v = value < 0 ? ~(value << 1) : value << 1;
      while (v >= 0x20) {
        out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
        v >>= 5;
      }
      out += String.fromCharCode(v + 63);
    };
    for (const [lat, lng] of points) {
      const iLat = Math.round(lat * 1e6);
      const iLng = Math.round(lng * 1e6);
      encode(iLat - prevLat);
      encode(iLng - prevLng);
      prevLat = iLat;
      prevLng = iLng;
    }
    return out;
  }
});
