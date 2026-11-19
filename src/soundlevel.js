'use strict';
/**
 * Sound pressure level (SPL) versus distance for a horn in open air.
 *
 * Same model as the trainhorn-calc Python core (https://github.com/train-horn/trainhorn-calc):
 *
 *   L(d) = L_ref - 20 * log10(d / d_ref) - alpha * (d - d_ref)
 *
 * L_ref is the level at the reference distance d_ref (horn ratings are usually
 * quoted "at 10 ft" or "at 1 m"); alpha is an optional air absorption in dB/km
 * applied to the extra path beyond d_ref (distances converted to metres).
 *
 * Free field, point source: no ground reflection, walls, wind or barriers.
 * Results are estimates, not measurements, and not a legal noise assessment.
 *
 * This module has no dependency on the `vscode` API so it can be unit tested in plain Node.
 */

const METERS_PER_FOOT = 0.3048;
const LENGTH_UNITS = ['ft', 'm'];

/** Approximate air absorption in dB/km at 10 degC, 70 % RH (ISO 9613-2 condition), by octave band in Hz. */
const AIR_ABSORPTION_DB_PER_KM = Object.freeze({
  63: 0.1, 125: 0.4, 250: 1.0, 500: 1.9, 1000: 3.7, 2000: 9.7, 4000: 32.8, 8000: 117.0,
});

class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
  }
}

function number(name, value) {
  if (typeof value === 'boolean' || value === null || value === undefined) {
    throw new InputError(`${name} must be a number`);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || !/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(trimmed)) {
      throw new InputError(`${name} must be a number, got "${value}"`);
    }
    value = Number(trimmed);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InputError(`${name} must be a finite number`);
  }
  return value;
}

function positive(name, value) {
  const n = number(name, value);
  if (n <= 0) throw new InputError(`${name} must be greater than 0, got ${n}`);
  return n;
}

function nonNegative(name, value) {
  const n = number(name, value);
  if (n < 0) throw new InputError(`${name} must be 0 or greater, got ${n}`);
  return n;
}

function lengthUnit(unit) {
  const u = typeof unit === 'string' ? unit.trim().toLowerCase() : unit;
  if (!LENGTH_UNITS.includes(u)) {
    throw new InputError(`unit must be one of ${LENGTH_UNITS.join(', ')}; got ${JSON.stringify(unit)}`);
  }
  return u;
}

function toMeters(value, unit) {
  return unit === 'ft' ? value * METERS_PER_FOOT : value;
}

/**
 * Estimate the SPL at `distance` from a level known at `refDistance`.
 * @param {number} sourceDb level in dB at refDistance (e.g. 150 for "150 dB at 10 ft")
 * @param {number} distance target distance (> 0)
 * @param {number} [refDistance=10] reference distance (> 0)
 * @param {'ft'|'m'} [unit='ft'] unit of both distances
 * @param {number} [absorptionDbPerKm=0] air absorption in dB/km (>= 0)
 * @returns {number} estimated level in dB
 */
function splAtDistance(sourceDb, distance, refDistance = 10, unit = 'ft', absorptionDbPerKm = 0) {
  sourceDb = number('source level (dB)', sourceDb);
  distance = positive('target distance', distance);
  refDistance = positive('reference distance', refDistance);
  unit = lengthUnit(unit);
  absorptionDbPerKm = nonNegative('air absorption (dB/km)', absorptionDbPerKm);

  let level = sourceDb - 20 * Math.log10(distance / refDistance);
  if (absorptionDbPerKm) {
    level -= (absorptionDbPerKm * (toMeters(distance, unit) - toMeters(refDistance, unit))) / 1000;
  }
  return level;
}

/**
 * Distance at which the level falls to `targetDb` (inverse of splAtDistance).
 * Closed form without absorption; bisection with absorption.
 */
function distanceForSpl(sourceDb, targetDb, refDistance = 10, unit = 'ft', absorptionDbPerKm = 0) {
  sourceDb = number('source level (dB)', sourceDb);
  targetDb = number('target level (dB)', targetDb);
  refDistance = positive('reference distance', refDistance);
  unit = lengthUnit(unit);
  absorptionDbPerKm = nonNegative('air absorption (dB/km)', absorptionDbPerKm);

  const freeField = refDistance * 10 ** ((sourceDb - targetDb) / 20);
  if (freeField === 0 || !Number.isFinite(freeField)) {
    throw new InputError('source and target levels are too far apart to give a usable distance');
  }
  if (!absorptionDbPerKm || freeField === refDistance) return freeField;

  let lo = Math.min(freeField, refDistance);
  let hi = Math.max(freeField, refDistance);
  for (let i = 0; i < 200; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (splAtDistance(sourceDb, mid, refDistance, unit, absorptionDbPerKm) - targetDb > 0) lo = mid;
    else hi = mid;
    if (hi - lo <= 1e-12 * hi) break;
  }
  return 0.5 * (lo + hi);
}

/** Level change in dB when the distance is multiplied by `ratio` (free field): 20*log10(ratio). */
function distanceRatioLoss(ratio) {
  return 20 * Math.log10(positive('ratio', ratio));
}

/** Combine incoherent sources: 10*log10(sum 10^(L/10)). Two equal horns add about 3.01 dB. */
function combineLevels(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new InputError('combineLevels needs at least one level');
  }
  const values = levels.map((v) => number('level', v));
  const peak = Math.max(...values);
  return peak + 10 * Math.log10(values.reduce((s, v) => s + 10 ** ((v - peak) / 10), 0));
}

/**
 * Parse a distance typed by a user: "100", "100 ft", "30m", "30 m", "100'".
 * @returns {{value:number, unit:'ft'|'m'|null}} unit is null when not given
 */
function parseDistance(text, name = 'distance') {
  if (typeof text !== 'string') throw new InputError(`${name} must be text`);
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(ft|feet|foot|'|m|meters?|metres?)?\s*$/i.exec(text);
  if (!m) throw new InputError(`${name}: enter a number, optionally followed by ft or m (e.g. "100 ft")`);
  const value = positive(name, Number(m[1]));
  let unit = null;
  if (m[2]) unit = /^(ft|feet|foot|')$/i.test(m[2]) ? 'ft' : 'm';
  return { value, unit };
}

/** Parse a level such as "150", "150 dB", "150dBA". */
function parseLevel(text, name = 'level') {
  if (typeof text !== 'string') throw new InputError(`${name} must be text`);
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(db\(?a?\)?|dba|dbc)?\s*$/i.exec(text);
  if (!m) throw new InputError(`${name}: enter a number of decibels (e.g. "150")`);
  return number(name, Number(m[1]));
}

/** Round to `digits` decimals and drop negative zero. */
function round(value, digits = 1) {
  const f = 10 ** digits;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/** Format a number with fixed decimals. */
function fmt(value, digits = 1) {
  return round(value, digits).toFixed(digits);
}

/**
 * Pattern for ratings written in text, e.g. "150 dB @ 10 ft", "149dB at 3 m", "118 dBA at 1m".
 * Groups: 1 = level, 2 = distance, 3 = unit.
 */
const RATING_PATTERN = /(\d{2,3}(?:\.\d+)?)\s*dB(?:A|C|\(A\))?\s*(?:@|at)\s*(\d+(?:\.\d+)?)\s*(ft|feet|foot|m|meters?|metres?)\b/gi;

/** Find horn ratings in a line of text. */
function findRatings(text) {
  const out = [];
  RATING_PATTERN.lastIndex = 0;
  let m;
  while ((m = RATING_PATTERN.exec(text)) !== null) {
    const unit = /^f/i.test(m[3]) ? 'ft' : 'm';
    const refDistance = Number(m[2]);
    if (refDistance > 0) {
      out.push({ db: Number(m[1]), refDistance, unit, start: m.index, end: m.index + m[0].length });
    }
  }
  return out;
}

/** Default distances for a quick table, per unit. */
const TABLE_DISTANCES = Object.freeze({ ft: [10, 50, 100, 250, 500, 1000, 2640], m: [1, 3, 10, 30, 100, 300, 1000] });

/** Build rows [{distance, db}] for a rating. */
function levelTable(db, refDistance, unit = 'ft', distances) {
  unit = lengthUnit(unit);
  const ds = distances || TABLE_DISTANCES[unit];
  return ds.map((d) => ({ distance: d, db: splAtDistance(db, d, refDistance, unit) }));
}

/** Rough everyday comparison for a level (labelled as approximate in the UI). */
function describeLevel(db) {
  const n = number('level', db);
  if (n >= 140) return 'at or above the threshold of pain; immediate hearing-damage risk';
  if (n >= 120) return 'painfully loud, like a thunderclap or a siren up close';
  if (n >= 100) return 'very loud, like a motorcycle or a power tool up close';
  if (n >= 85) return 'loud; long exposure at this level can damage hearing';
  if (n >= 70) return 'like busy traffic or a vacuum cleaner';
  if (n >= 50) return 'like normal conversation';
  return 'quiet';
}

module.exports = {
  METERS_PER_FOOT,
  LENGTH_UNITS,
  AIR_ABSORPTION_DB_PER_KM,
  TABLE_DISTANCES,
  InputError,
  splAtDistance,
  distanceForSpl,
  distanceRatioLoss,
  combineLevels,
  parseDistance,
  parseLevel,
  findRatings,
  levelTable,
  describeLevel,
  round,
  fmt,
};
