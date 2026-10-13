/**
 * Κατεβάζει τη βάση σταθμών διοδίων του mydiodia.gr (CC BY 4.0) και παράγει
 * το src/app/data/toll-stations.ts με μόνο τα πεδία που χρειαζόμαστε.
 *
 * Χρήση:  npm run update-tolls
 *
 * Το αρχείο της πηγής είναι JavaScript (όχι JSON), οπότε το εκτελούμε σε
 * απομονωμένο vm context και κρατάμε μόνο τον πίνακα TOLL_DATA.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SOURCE_URL = 'https://mydiodia.gr/data/tolls.js';
const OUT_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../src/app/data/toll-stations.ts');

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`HTTP ${res.status} από ${SOURCE_URL}`);
const source = await res.text();

const context = { module: { exports: {} } };
vm.runInNewContext(source, context, { timeout: 5000 });
const data = context.module.exports.TOLL_DATA;
if (!Array.isArray(data) || data.length === 0) throw new Error('Δεν βρέθηκε ο πίνακας TOLL_DATA.');

const stations = data
  .filter((t) => t.status !== 'upcoming')
  .map((t) => {
    for (const key of ['id', 'name_gr', 'highway', 'type', 'lat', 'lng', 'cat1', 'cat2']) {
      if (t[key] == null) throw new Error(`Λείπει το πεδίο "${key}" στον σταθμό ${t.id}`);
    }
    return {
      id: t.id,
      name: t.name_gr,
      highway: t.highway,
      type: t.type,
      ...(t.direction ? { direction: t.direction } : {}),
      ...(t.role ? { role: t.role } : {}),
      ...(t.charge_once_group ? { chargeOnceGroup: t.charge_once_group } : {}),
      lat: t.lat,
      lng: t.lng,
      motorcycle: t.cat1,
      car: t.cat2,
    };
  });

const today = new Date().toISOString().slice(0, 10);
const body = stations.map((s) => `  ${JSON.stringify(s)},`).join('\n');

const output = `// ΑΥΤΟΜΑΤΑ ΠΑΡΑΓΟΜΕΝΟ ΑΡΧΕΙΟ — μην το επεξεργάζεσαι με το χέρι.
// Ενημέρωση με: npm run update-tolls
//
// Πηγή: mydiodia.gr (${SOURCE_URL}), άδεια CC BY 4.0
// https://creativecommons.org/licenses/by/4.0/
// Λήψη: ${today} · ${stations.length} σταθμοί

import { TollStation } from '../models/toll-station.model';

export const TOLL_DATA_FETCHED_AT = '${today}';

export const TOLL_STATIONS: TollStation[] = [
${body}
];
`;

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, output, 'utf8');
console.log(`Γράφτηκαν ${stations.length} σταθμοί στο ${OUT_FILE}`);
