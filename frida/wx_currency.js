'use strict';

const banks = new Map();
const locks = new Map();
const storageState = {
  installed: false,
  desiredHoney: null,
  instance: null,
  mmkvId: null,
  lastPlayerData: null,
  reads: 0,
  writes: 0,
};
const runtimePatchState = {
  installed: false,
  targetValue: 999999,
  patchHits: 0,
  requestHits: 0,
  sourceReads: 0,
  sourcePath: '/data/local/tmp/mgss-js-game.js',
  targetScriptName: 'https://usr/js/game.js',
  cachedSource: null,
  hooks: [],
  lastMethod: null,
  lastSourceLength: 0,
  lastPatchedAt: null,
  lastReplacementCounts: {},
  lastError: null,
};
const DEFAULT_TYPES = ['i32', 'f64', 'smi32', 'smi64'];
const MAX_CANDIDATES = 50000;
const DEFAULT_MAX_WRITES = 64;
const SCAN_CHUNK_SIZE = 32 * 1024 * 1024;

function getBank(slot) {
  if (!banks.has(slot)) {
    banks.set(slot, { candidates: [], scannedValue: null, scanTypes: [] });
  }
  return banks.get(slot);
}

function bytesToPattern(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(' ');
}

function numberPattern(value, type) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  if (type === 'i32' || type === 'smi32') {
    const encoded = type === 'smi32' ? number * 2 : number;
    if (!Number.isSafeInteger(encoded) || encoded < -0x80000000 || encoded > 0x7fffffff) {
      throw new Error(`${type} cannot represent ${value}`);
    }
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setInt32(0, encoded, true);
    return bytesToPattern(new Uint8Array(buffer));
  }

  if (type === 'f32') {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, number, true);
    return bytesToPattern(new Uint8Array(buffer));
  }

  if (type === 'f64') {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, number, true);
    return bytesToPattern(new Uint8Array(buffer));
  }

  if (type === 'smi64') {
    if (!Number.isSafeInteger(number)) {
      throw new Error(`smi64 requires a safe integer: ${value}`);
    }
    let encoded = BigInt(number) << 32n;
    const bytes = [];
    for (let index = 0n; index < 8n; index++) {
      bytes.push(Number((encoded >> (index * 8n)) & 0xffn));
    }
    return bytesToPattern(bytes);
  }

  throw new Error(`Unsupported numeric type: ${type}`);
}

function readCandidate(candidate) {
  const address = ptr(candidate.address);
  switch (candidate.type) {
    case 'i32':
      return address.readS32();
    case 'f32':
      return address.readFloat();
    case 'f64':
      return address.readDouble();
    case 'smi32':
      return address.readS32() / 2;
    case 'smi64':
      return Number(BigInt(address.readU64().toString()) >> 32n);
    default:
      throw new Error(`Unsupported candidate type: ${candidate.type}`);
  }
}

function writeCandidate(candidate, value) {
  const number = Number(value);
  const address = ptr(candidate.address);
  switch (candidate.type) {
    case 'i32':
      address.writeS32(number);
      break;
    case 'f32':
      address.writeFloat(number);
      break;
    case 'f64':
      address.writeDouble(number);
      break;
    case 'smi32':
      address.writeS32(number * 2);
      break;
    case 'smi64': {
      const encoded = BigInt(Math.trunc(number)) << 32n;
      address.writeU64(encoded.toString());
      break;
    }
    default:
      throw new Error(`Unsupported candidate type: ${candidate.type}`);
  }
  candidate.last = number;
}

function numbersEqual(left, right, type) {
  if (type === 'f32' || type === 'f64') {
    const scale = Math.max(1, Math.abs(left), Math.abs(right));
    return Math.abs(left - right) <= Number.EPSILON * scale * 8;
  }
  return left === right;
}

function writableAnonymousRanges(includeFileBacked) {
  const protections = ['rw-', 'rwx'];
  const ranges = [];
  for (const protection of protections) {
    for (const range of Process.enumerateRanges({ protection, coalesce: false })) {
      if (!includeFileBacked && range.file) {
        continue;
      }
      ranges.push(range);
    }
  }
  return ranges;
}

async function scanRange(base, size, pattern, onMatch) {
  return new Promise((resolve) => {
    Memory.scan(base, size, pattern, {
      onMatch(address, matchSize) {
        return onMatch(address, matchSize);
      },
      onError(reason) {
        send({ type: 'scan-warning', base: base.toString(), size, reason });
      },
      onComplete() {
        resolve();
      },
    });
  });
}

async function initialScan(slot, value, types, options) {
  const bank = getBank(slot);
  const selectedTypes = Array.isArray(types) && types.length ? types : DEFAULT_TYPES;
  const includeFileBacked = Boolean(options && options.includeFileBacked);
  const maxCandidates = Number(options && options.maxCandidates) || MAX_CANDIDATES;
  const ranges = writableAnonymousRanges(includeFileBacked);
  const candidates = [];
  const seen = new Set();

  for (const type of selectedTypes) {
    const pattern = numberPattern(value, type);
    for (const range of ranges) {
      let offset = 0;
      while (offset < range.size) {
        const size = Math.min(SCAN_CHUNK_SIZE, range.size - offset);
        const base = range.base.add(offset);
        await scanRange(base, size, pattern, (address) => {
          const key = `${address}:${type}`;
          if (!seen.has(key)) {
            seen.add(key);
            candidates.push({ address: address.toString(), type, last: Number(value) });
          }
          if (candidates.length >= maxCandidates) {
            return 'stop';
          }
          return undefined;
        });
        if (candidates.length >= maxCandidates) {
          break;
        }
        offset += size;
      }
      if (candidates.length >= maxCandidates) {
        break;
      }
    }
    if (candidates.length >= maxCandidates) {
      break;
    }
  }

  bank.candidates = candidates;
  bank.scannedValue = Number(value);
  bank.scanTypes = selectedTypes.slice();
  return bankSummary(slot, bank);
}

function refine(slot, mode, value) {
  const bank = getBank(slot);
  const target = value === null || value === undefined ? null : Number(value);
  const kept = [];

  for (const candidate of bank.candidates) {
    try {
      const current = readCandidate(candidate);
      let match = false;
      switch (mode) {
        case 'exact':
          if (target === null || !Number.isFinite(target)) {
            throw new Error('exact refinement requires a numeric value');
          }
          match = numbersEqual(current, target, candidate.type);
          break;
        case 'changed':
          match = !numbersEqual(current, candidate.last, candidate.type);
          break;
        case 'unchanged':
          match = numbersEqual(current, candidate.last, candidate.type);
          break;
        case 'increased':
          match = current > candidate.last;
          break;
        case 'decreased':
          match = current < candidate.last;
          break;
        default:
          throw new Error(`Unsupported refinement mode: ${mode}`);
      }
      if (match) {
        candidate.last = current;
        kept.push(candidate);
      }
    } catch (_) {
      // A V8 heap page may disappear between scans; stale candidates are discarded.
    }
  }

  bank.candidates = kept;
  return bankSummary(slot, bank);
}

function writeBank(slot, value, maxWrites) {
  const bank = getBank(slot);
  const limit = Number(maxWrites) || DEFAULT_MAX_WRITES;
  if (bank.candidates.length === 0) {
    throw new Error(`${slot} has no candidates`);
  }
  if (bank.candidates.length > limit) {
    throw new Error(`${slot} still has ${bank.candidates.length} candidates; refine to ${limit} or fewer before writing`);
  }

  let written = 0;
  const survivors = [];
  for (const candidate of bank.candidates) {
    try {
      writeCandidate(candidate, value);
      written += 1;
      survivors.push(candidate);
    } catch (_) {
      // Ignore stale mappings and keep the valid candidate set compact.
    }
  }
  bank.candidates = survivors;
  return { slot, value: Number(value), written, remaining: survivors.length };
}

function startLock(slot, value, intervalMs, maxWrites) {
  stopLock(slot);
  const initial = writeBank(slot, value, maxWrites);
  const delay = Math.max(25, Number(intervalMs) || 100);
  const timer = setInterval(() => {
    try {
      writeBank(slot, value, maxWrites);
    } catch (error) {
      send({ type: 'lock-error', slot, error: String(error) });
      stopLock(slot);
    }
  }, delay);
  locks.set(slot, { timer, value: Number(value), intervalMs: delay });
  return { ...initial, locked: true, intervalMs: delay };
}

function stopLock(slot) {
  const active = locks.get(slot);
  if (!active) {
    return false;
  }
  clearInterval(active.timer);
  locks.delete(slot);
  return true;
}

function bankSummary(slot, bank) {
  const byType = {};
  for (const candidate of bank.candidates) {
    byType[candidate.type] = (byType[candidate.type] || 0) + 1;
  }
  const activeLock = locks.get(slot);
  return {
    slot,
    candidates: bank.candidates.length,
    byType,
    scannedValue: bank.scannedValue,
    scanTypes: bank.scanTypes,
    lock: activeLock ? { value: activeLock.value, intervalMs: activeLock.intervalMs } : null,
  };
}

function patchPlayerData(rawValue, honey) {
  if (rawValue === null || rawValue === undefined) {
    return rawValue;
  }
  try {
    const data = JSON.parse(String(rawValue));
    if (!Object.prototype.hasOwnProperty.call(data, '_gold')) {
      return rawValue;
    }
    data._gold = Number(honey);
    return JSON.stringify(data);
  } catch (_) {
    return rawValue;
  }
}

function captureStorageInstance(instance, rawValue, operation) {
  try {
    storageState.instance = Java.retain(instance);
    storageState.mmkvId = instance.mmapID().toString();
  } catch (_) {
    storageState.instance = null;
  }
  storageState.lastPlayerData = rawValue === null || rawValue === undefined ? null : String(rawValue);
  storageState[operation] += 1;
}

function isPlayerDataValue(key, value) {
  return String(key) === 'PlayerData' || (value !== null && value !== undefined && String(value).indexOf('"_gold"') >= 0);
}

function installStorageHook() {
  if (storageState.installed) {
    return Promise.resolve(storageSummary());
  }
  if (!Java.available) {
    throw new Error('Java runtime is unavailable in this process');
  }

  return new Promise((resolve, reject) => {
    Java.perform(() => {
      try {
        const MMKV = Java.use('com.tencent.mmkv.MMKV');
        const encode = MMKV.encode.overload('java.lang.String', 'java.lang.String');
        const encodeExpiring = MMKV.encode.overload('java.lang.String', 'java.lang.String', 'int');
        const decode = MMKV.decodeString.overload('java.lang.String');
        const decodeDefault = MMKV.decodeString.overload('java.lang.String', 'java.lang.String');
        const encodeNative = MMKV.encodeString.overload('long', 'java.lang.String', 'java.lang.String');
        const decodeNative = MMKV.decodeString.overload('long', 'java.lang.String', 'java.lang.String');

        encode.implementation = function (key, value) {
          let nextValue = value;
          if (isPlayerDataValue(key, value)) {
            captureStorageInstance(this, value, 'writes');
            if (storageState.desiredHoney !== null) {
              nextValue = patchPlayerData(value, storageState.desiredHoney);
              storageState.lastPlayerData = String(nextValue);
            }
          }
          return encode.call(this, key, nextValue);
        };

        encodeExpiring.implementation = function (key, value, expire) {
          let nextValue = value;
          if (isPlayerDataValue(key, value)) {
            captureStorageInstance(this, value, 'writes');
            if (storageState.desiredHoney !== null) {
              nextValue = patchPlayerData(value, storageState.desiredHoney);
              storageState.lastPlayerData = String(nextValue);
            }
          }
          return encodeExpiring.call(this, key, nextValue, expire);
        };

        decode.implementation = function (key) {
          let value = decode.call(this, key);
          if (isPlayerDataValue(key, value)) {
            captureStorageInstance(this, value, 'reads');
            if (storageState.desiredHoney !== null) {
              value = patchPlayerData(value, storageState.desiredHoney);
              storageState.lastPlayerData = String(value);
            }
          }
          return value;
        };

        decodeDefault.implementation = function (key, defaultValue) {
          let value = decodeDefault.call(this, key, defaultValue);
          if (isPlayerDataValue(key, value)) {
            captureStorageInstance(this, value, 'reads');
            if (storageState.desiredHoney !== null) {
              value = patchPlayerData(value, storageState.desiredHoney);
              storageState.lastPlayerData = String(value);
            }
          }
          return value;
        };

        encodeNative.implementation = function (handle, key, value) {
          let nextValue = value;
          if (isPlayerDataValue(key, value)) {
            captureStorageInstance(this, value, 'writes');
            if (storageState.desiredHoney !== null) {
              nextValue = patchPlayerData(value, storageState.desiredHoney);
              storageState.lastPlayerData = String(nextValue);
            }
          }
          return encodeNative.call(this, handle, key, nextValue);
        };

        decodeNative.implementation = function (handle, key, defaultValue) {
          let value = decodeNative.call(this, handle, key, defaultValue);
          if (isPlayerDataValue(key, value)) {
            captureStorageInstance(this, value, 'reads');
            if (storageState.desiredHoney !== null) {
              value = patchPlayerData(value, storageState.desiredHoney);
              storageState.lastPlayerData = String(value);
            }
          }
          return value;
        };

        storageState.installed = true;
        resolve(storageSummary());
      } catch (error) {
        reject(error);
      }
    });
  });
}

function storageSummary() {
  let currentHoney = null;
  if (storageState.lastPlayerData) {
    try {
      currentHoney = JSON.parse(storageState.lastPlayerData)._gold;
    } catch (_) {}
  }
  return {
    installed: storageState.installed,
    ready: storageState.instance !== null && storageState.lastPlayerData !== null,
    mmkvId: storageState.mmkvId,
    desiredHoney: storageState.desiredHoney,
    currentHoney,
    reads: storageState.reads,
    writes: storageState.writes,
  };
}

function writePersistentHoney(value) {
  storageState.desiredHoney = Number(value);
  return installStorageHook().then(() => new Promise((resolve, reject) => {
    Java.perform(() => {
      try {
        if (storageState.instance === null || storageState.lastPlayerData === null) {
          resolve(storageSummary());
          return;
        }
        const MMKV = Java.use('com.tencent.mmkv.MMKV');
        const encode = MMKV.encode.overload('java.lang.String', 'java.lang.String');
        const patched = patchPlayerData(storageState.lastPlayerData, storageState.desiredHoney);
        const ok = encode.call(storageState.instance, 'PlayerData', patched);
        storageState.lastPlayerData = String(patched);
        const result = storageSummary();
        result.persisted = Boolean(ok);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }));
}

function countOccurrences(text, needle) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(needle, offset);
    if (index < 0) {
      return count;
    }
    count += 1;
    offset = index + needle.length;
  }
}

function patchCurrencyBundle(source, targetValue) {
  const target = Number(targetValue);
  if (!Number.isSafeInteger(target) || target < 0) {
    throw new Error(`runtime target must be a non-negative safe integer: ${targetValue}`);
  }

  const replacements = [
    {
      name: 'local-resource-read',
      needle: '{key:"hsn",value:function hsn(t){t=this.prp[t];return null==t?null:t;}}',
      replacement: `{key:"hsn",value:function hsn(t){var i=this.prp[t];return null==i?null:(t==O.instance.player.rqp&&(i.gold1=${target},i.gold2=${target}),i);}}`,
    },
    {
      name: 'local-resource-create',
      needle: '{key:"frt",value:function frt(t){var i=this.prp[t];return null==i&&(i={gold1:0,gold2:0},this.prp[t]=i),i;}}',
      replacement: `{key:"frt",value:function frt(t){var i=this.prp[t];return null==i&&(i={gold1:t==O.instance.player.rqp?${target}:0,gold2:t==O.instance.player.rqp?${target}:0},this.prp[t]=i),i;}}`,
    },
    {
      name: 'local-resource-update',
      needle: '{key:"xcl",value:function xcl(t,i,s){var e=this.prp[t];(e=e||this.frt(t)).gold1+=i,e.gold2+=s,e.gold1=Math.round(10*e.gold1)/10,e.gold2=Math.round(10*e.gold2)/10;}}',
      replacement: `{key:"xcl",value:function xcl(t,i,s){var e=this.prp[t];t==O.instance.player.rqp?((e=e||this.frt(t)).gold1=${target},e.gold2=${target}):((e=e||this.frt(t)).gold1+=i,e.gold2+=s,e.gold1=Math.round(10*e.gold1)/10,e.gold2=Math.round(10*e.gold2)/10);}}`,
    },
    {
      name: 'honey-accessor',
      needle: '{key:"gold",get:function get(){return this._data._gold;},set:function set(t){if(this._data._gold=t,',
      replacement: `{key:"gold",get:function get(){return this._data._gold=${target};},set:function set(t){if(this._data._gold=${target},`,
    },
    {
      name: 'honey-update',
      needle: '{key:"wtn",value:function wtn(t){if(this._data._gold+=t,',
      replacement: `{key:"wtn",value:function wtn(t){if(this._data._gold=${target},`,
    },
  ];

  const counts = {};
  for (const item of replacements) {
    counts[item.name] = countOccurrences(source, item.needle);
  }
  const mismatches = Object.entries(counts).filter(([, count]) => count !== 1);
  if (mismatches.length > 0) {
    return { source, changed: false, counts, mismatches };
  }

  let patched = source;
  for (const item of replacements) {
    patched = patched.replace(item.needle, item.replacement);
  }
  return { source: patched, changed: true, counts, mismatches: [] };
}

function runtimePatchSummary() {
  return {
    installed: runtimePatchState.installed,
    targetValue: runtimePatchState.targetValue,
    patchHits: runtimePatchState.patchHits,
    requestHits: runtimePatchState.requestHits,
    sourceReads: runtimePatchState.sourceReads,
    sourcePath: runtimePatchState.sourcePath,
    targetScriptName: runtimePatchState.targetScriptName,
    hookedMethods: runtimePatchState.hooks.map((hook) => hook.name),
    lastMethod: runtimePatchState.lastMethod,
    lastSourceLength: runtimePatchState.lastSourceLength,
    lastPatchedAt: runtimePatchState.lastPatchedAt,
    lastReplacementCounts: runtimePatchState.lastReplacementCounts,
    lastError: runtimePatchState.lastError,
  };
}

function setRuntimeSource(path) {
  const sourcePath = String(path || '').trim();
  if (!sourcePath.startsWith('/')) {
    throw new Error(`runtime source path must be absolute: ${path}`);
  }
  runtimePatchState.sourcePath = sourcePath;
  runtimePatchState.cachedSource = null;
  return runtimePatchSummary();
}

function patchJavaScriptArgument(value, methodName) {
  if (value === null || value === undefined) {
    return value;
  }
  const source = String(value);
  if (source.indexOf('{key:"hsn",value:function hsn(t)') < 0) {
    return value;
  }

  const result = patchCurrencyBundle(source, runtimePatchState.targetValue);
  runtimePatchState.lastMethod = methodName;
  runtimePatchState.lastSourceLength = source.length;
  runtimePatchState.lastReplacementCounts = result.counts;
  if (!result.changed) {
    runtimePatchState.lastError = `bundle signature mismatch: ${JSON.stringify(result.mismatches)}`;
    send({ type: 'runtime-patch-mismatch', method: methodName, counts: result.counts });
    return value;
  }

  runtimePatchState.patchHits += 1;
  runtimePatchState.lastPatchedAt = Date.now();
  runtimePatchState.lastError = null;
  send({ type: 'runtime-patched', method: methodName, targetValue: runtimePatchState.targetValue, counts: result.counts });
  return result.source;
}

function hookJavaScriptLoader(overload, name, stringIndexes) {
  overload.implementation = function () {
    const args = Array.prototype.slice.call(arguments);
    for (const index of stringIndexes) {
      args[index] = patchJavaScriptArgument(args[index], name);
    }
    return overload.call(this, ...args);
  };
  runtimePatchState.hooks.push({ name, overload });
}

function readJavaUtf8File(path) {
  const Files = Java.use('java.nio.file.Files');
  const Paths = Java.use('java.nio.file.Paths');
  const JString = Java.use('java.lang.String');
  const StandardCharsets = Java.use('java.nio.charset.StandardCharsets');
  const emptySegments = Java.array('java.lang.String', []);
  const javaPath = Paths.get.overload('java.lang.String', '[Ljava.lang.String;')
    .call(Paths, path, emptySegments);
  const bytes = Files.readAllBytes(javaPath);
  runtimePatchState.sourceReads += 1;
  return String(JString.$new(bytes, StandardCharsets.UTF_8.value));
}

function hookV8ScriptRequests(overload, name) {
  const Request = Java.use('com.eclipsesource.mmv8.V8ScriptEvaluateRequest');
  const JString = Java.use('java.lang.String');

  overload.implementation = function (requests, cachePath, callback) {
    try {
      for (let index = 0; index < requests.size(); index++) {
        const request = Java.cast(requests.get(index), Request);
        const scriptName = request.scriptName.value === null
          ? null
          : String(request.scriptName.value);
        if (scriptName !== runtimePatchState.targetScriptName) {
          continue;
        }

        runtimePatchState.requestHits += 1;
        if (runtimePatchState.cachedSource === null) {
          runtimePatchState.cachedSource = readJavaUtf8File(runtimePatchState.sourcePath);
        }
        const source = runtimePatchState.cachedSource;
        const patched = patchJavaScriptArgument(source, name);
        if (patched === source) {
          continue;
        }

        request.scriptType.value = Request.SCRIPT_TYPE_TEXT.value;
        request.scriptText.value = JString.$new(patched);
        request.scriptFd.value = null;
        request.scriptWxaFd.value = null;
        request.cacheKey.value = null;
        request.cacheCategory.value = null;
        request.lineNumber.value = 0;
      }
    } catch (error) {
      runtimePatchState.lastError = String(error);
      send({ type: 'runtime-request-patch-error', method: name, error: String(error) });
    }
    return overload.call(this, requests, cachePath, callback);
  };
  runtimePatchState.hooks.push({ name, overload });
}

function installRuntimePatch(value) {
  runtimePatchState.targetValue = Number(value);
  if (!Number.isSafeInteger(runtimePatchState.targetValue) || runtimePatchState.targetValue < 0) {
    throw new Error(`runtime target must be a non-negative safe integer: ${value}`);
  }
  if (runtimePatchState.installed) {
    return Promise.resolve(runtimePatchSummary());
  }
  if (!Java.available) {
    throw new Error('Java runtime is unavailable in this process');
  }

  return new Promise((resolve, reject) => {
    Java.perform(() => {
      try {
        const Runtime = Java.use('com.tencent.mm.plugin.appbrand.jsruntime.h');
        hookJavaScriptLoader(
          Runtime.M.overload('java.net.URL', 'java.lang.String', 'java.lang.String', 'int', 'java.lang.String', 'android.webkit.ValueCallback'),
          'h.M',
          [1, 2, 4],
        );
        hookJavaScriptLoader(
          Runtime.Q.overload('java.net.URL', 'java.lang.String', 'android.webkit.ValueCallback'),
          'h.Q',
          [1],
        );
        hookJavaScriptLoader(
          Runtime.c0.overload('java.net.URL', 'java.lang.String', 'java.lang.String', 'int', 'java.lang.String', 'hl.v0'),
          'h.c0',
          [1, 2, 4],
        );
        hookJavaScriptLoader(
          Runtime.evaluateJavascript.overload('java.lang.String', 'android.webkit.ValueCallback'),
          'h.evaluateJavascript',
          [0],
        );
        hookJavaScriptLoader(
          Runtime.precompile.overload('java.lang.String', 'java.lang.String'),
          'h.precompile',
          [0, 1],
        );
        hookV8ScriptRequests(
          Runtime.k0.overload('java.util.ArrayList', 'java.lang.String', 'hl.v0'),
          'h.k0',
        );
        runtimePatchState.installed = true;
        runtimePatchState.lastError = null;
        resolve(runtimePatchSummary());
      } catch (error) {
        runtimePatchState.lastError = String(error);
        for (const hook of runtimePatchState.hooks) {
          hook.overload.implementation = null;
        }
        runtimePatchState.hooks = [];
        reject(error);
      }
    });
  });
}

function uninstallRuntimePatch() {
  if (!runtimePatchState.installed) {
    return Promise.resolve(runtimePatchSummary());
  }
  return new Promise((resolve, reject) => {
    Java.perform(() => {
      try {
        for (const hook of runtimePatchState.hooks) {
          hook.overload.implementation = null;
        }
        runtimePatchState.hooks = [];
        runtimePatchState.installed = false;
        resolve(runtimePatchSummary());
      } catch (error) {
        runtimePatchState.lastError = String(error);
        reject(error);
      }
    });
  });
}

async function probeText(text, maxResults) {
  const bytes = [];
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code > 0x7f) {
      throw new Error('probe currently accepts ASCII markers only');
    }
    bytes.push(code);
  }
  const pattern = bytesToPattern(bytes);
  const limit = Math.max(1, Number(maxResults) || 1);
  const hits = [];
  const protections = ['r--', 'rw-', 'r-x', 'rwx'];

  for (const protection of protections) {
    for (const range of Process.enumerateRanges({ protection, coalesce: false })) {
      let offset = 0;
      while (offset < range.size) {
        const size = Math.min(SCAN_CHUNK_SIZE, range.size - offset);
        await scanRange(range.base.add(offset), size, pattern, (address) => {
          hits.push(address.toString());
          return hits.length >= limit ? 'stop' : undefined;
        });
        if (hits.length >= limit) {
          return { text, hits };
        }
        offset += size;
      }
    }
  }
  return { text, hits };
}

rpc.exports = {
  ping() {
    return { pid: Process.id, arch: Process.arch, platform: Process.platform };
  },

  probe(text, maxResults) {
    return probeText(String(text), maxResults);
  },

  scan(slot, value, types, options) {
    stopLock(String(slot));
    return initialScan(String(slot), value, types, options || {});
  },

  refine(slot, mode, value) {
    return refine(String(slot), String(mode), value);
  },

  list(slot, limit) {
    const bank = getBank(String(slot));
    const count = Math.max(1, Number(limit) || 20);
    return bank.candidates.slice(0, count).map((candidate, index) => {
      let current = null;
      try {
        current = readCandidate(candidate);
      } catch (_) {
        current = '<stale>';
      }
      return { index, address: candidate.address, type: candidate.type, current, previous: candidate.last };
    });
  },

  select(slot, indexes) {
    const name = String(slot);
    const bank = getBank(name);
    const selected = Array.isArray(indexes) ? indexes.map(Number) : [Number(indexes)];
    const next = [];
    for (const index of selected) {
      if (Number.isInteger(index) && index >= 0 && index < bank.candidates.length) {
        next.push(bank.candidates[index]);
      }
    }
    bank.candidates = next;
    return bankSummary(name, bank);
  },

  write(slot, value, maxWrites) {
    return writeBank(String(slot), value, maxWrites);
  },

  lock(slot, value, intervalMs, maxWrites) {
    return startLock(String(slot), value, intervalMs, maxWrites);
  },

  unlock(slot) {
    return { slot: String(slot), unlocked: stopLock(String(slot)) };
  },

  clear(slot) {
    stopLock(String(slot));
    banks.delete(String(slot));
    return { slot: String(slot), cleared: true };
  },

  status() {
    return Array.from(banks.entries(), ([slot, bank]) => bankSummary(slot, bank));
  },

  storagehook() {
    return installStorageHook();
  },

  storagewrite(value) {
    return writePersistentHoney(value);
  },

  storagestatus() {
    return storageSummary();
  },

  runtimelock(value) {
    return installRuntimePatch(value);
  },

  runtimesource(path) {
    return setRuntimeSource(path);
  },

  runtimeunlock() {
    return uninstallRuntimePatch();
  },

  runtimestatus() {
    return runtimePatchSummary();
  },
};
