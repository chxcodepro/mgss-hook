import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agentSource = fs.readFileSync(path.join(root, 'frida', 'wx_currency.js'), 'utf8');
const bundlePath = process.argv[2] || process.env.MGSS_BUNDLE_SOURCE;

if (!bundlePath) {
  throw new Error('Pass the unpacked app/js/game.js path or set MGSS_BUNDLE_SOURCE');
}

const helperStart = agentSource.indexOf('function countOccurrences');
const helperEnd = agentSource.indexOf('function runtimePatchSummary');
if (helperStart < 0 || helperEnd < 0) {
  throw new Error('Unable to locate patchCurrencyBundle in the Frida agent');
}

// The evaluated slice only defines the pure bundle-patching helpers.
const { patchCurrencyBundle } = new Function(
  `${agentSource.slice(helperStart, helperEnd)}; return { patchCurrencyBundle };`,
)();

const original = fs.readFileSync(bundlePath, 'utf8');
const patch = patchCurrencyBundle(original, 999999);
const countsAreExact = Object.values(patch.counts).every((count) => count === 1);

if (!patch.changed || !countsAreExact) {
  throw new Error(`Bundle signatures did not match exactly: ${JSON.stringify(patch.counts)}`);
}

const O = { instance: { player: { rqp: 7 } } };

function extractFunction(name, nextKey) {
  const start = patch.source.indexOf(`function ${name}`);
  const end = patch.source.indexOf(`}},{key:"${nextKey}"`, start);
  if (start < 0 || end < 0) {
    throw new Error(`Unable to extract ${name}`);
  }
  return eval(`(${patch.source.slice(start, end + 1)})`);
}

const hsn = extractFunction('hsn(t){', 'frt');
const frt = extractFunction('frt(t){', 'htx');
const xcl = extractFunction('xcl(t,i,s){', 'prr');
const manager = {
  prp: {
    7: { gold1: 1, gold2: 2 },
    8: { gold1: 3, gold2: 4 },
  },
  frt,
};

hsn.call(manager, 7);
hsn.call(manager, 8);
xcl.call(manager, 7, 5, 6);
xcl.call(manager, 8, 5, 6);

const localCreated = frt.call({ prp: {} }, 7);
const botCreated = frt.call({ prp: {} }, 8);
const result = {
  counts: patch.counts,
  local: manager.prp[7],
  bot: manager.prp[8],
  localCreated,
  botCreated,
};

if (
  result.local.gold1 !== 999999
  || result.local.gold2 !== 999999
  || result.bot.gold1 !== 8
  || result.bot.gold2 !== 10
  || result.localCreated.gold1 !== 999999
  || result.localCreated.gold2 !== 999999
  || result.botCreated.gold1 !== 0
  || result.botCreated.gold2 !== 0
) {
  throw new Error(`Scoped behavior mismatch: ${JSON.stringify(result)}`);
}

console.log(JSON.stringify(result));
