'use strict';
const assert = require('node:assert/strict');
const sl = require('../../src/soundlevel');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

describe('splAtDistance', () => {
  it('matches the core-python vector: 150 dB @ 10 ft -> 130.0 dB @ 100 ft', () => {
    assert.equal(sl.round(sl.splAtDistance(150, 100), 1), 130.0);
    close(sl.splAtDistance(150, 100, 10, 'ft'), 130);
  });
  it('loses about 6.02 dB per doubling of distance', () => {
    close(sl.splAtDistance(120, 20, 10), 120 - 20 * Math.log10(2));
    close(sl.distanceRatioLoss(2), 6.020599913279624);
  });
  it('returns the source level at the reference distance', () => {
    close(sl.splAtDistance(118, 3, 3, 'm'), 118);
  });
  it('gets louder when closer than the reference distance', () => {
    close(sl.splAtDistance(150, 1, 10), 170);
  });
  it('works in metres', () => {
    close(sl.splAtDistance(149, 30, 3, 'm'), 129);
  });
  it('is unit-independent without absorption', () => {
    close(sl.splAtDistance(150, 100, 10, 'ft'), sl.splAtDistance(150, 100, 10, 'm'));
  });
  it('applies air absorption to the extra path in metres', () => {
    // 1000 ft - 10 ft = 990 ft = 301.752 m; 1.9 dB/km -> 0.5733288 dB
    close(sl.splAtDistance(150, 1000, 10, 'ft', 1.9), 110 - 1.9 * 0.301752);
    close(sl.splAtDistance(100, 1000, 10, 'm', 10), 100 - 40 - 9.9);
  });
  it('accepts numeric strings and unit case/space variants', () => {
    close(sl.splAtDistance('150', '100', '10', ' FT '), 130);
  });
  it('rejects invalid inputs', () => {
    assert.throws(() => sl.splAtDistance(150, 0), sl.InputError);
    assert.throws(() => sl.splAtDistance(150, -5), /greater than 0/);
    assert.throws(() => sl.splAtDistance(150, 100, 0), /reference distance/);
    assert.throws(() => sl.splAtDistance(150, 100, 10, 'yd'), /unit must be one of/);
    assert.throws(() => sl.splAtDistance(150, 100, 10, 'ft', -1), /0 or greater/);
    assert.throws(() => sl.splAtDistance(NaN, 100), /finite/);
    assert.throws(() => sl.splAtDistance(true, 100), /number/);
    assert.throws(() => sl.splAtDistance('abc', 100), /number/);
    assert.throws(() => sl.splAtDistance(Infinity, 100), /finite/);
  });
});

describe('distanceForSpl', () => {
  it('inverts the vector: 150 dB @ 10 ft reaches 130 dB at 100 ft', () => {
    close(sl.distanceForSpl(150, 130), 100, 1e-9);
  });
  it('returns a distance closer than the reference for louder targets', () => {
    close(sl.distanceForSpl(150, 170), 1, 1e-12);
  });
  it('round-trips with absorption (bisection)', () => {
    for (const [src, tgt, ref, unit, a] of [[150, 90, 10, 'ft', 1.9], [130, 70, 1, 'm', 3.7], [150, 160, 10, 'ft', 9.7]]) {
      const d = sl.distanceForSpl(src, tgt, ref, unit, a);
      close(sl.splAtDistance(src, d, ref, unit, a), tgt, 1e-6);
    }
  });
  it('absorption shortens the distance for a quieter target', () => {
    assert.ok(sl.distanceForSpl(150, 90, 10, 'ft', 1.9) < sl.distanceForSpl(150, 90, 10, 'ft'));
  });
  it('returns the reference distance when levels are equal', () => {
    assert.equal(sl.distanceForSpl(120, 120, 10, 'ft', 5), 10);
  });
  it('rejects levels too far apart', () => {
    assert.throws(() => sl.distanceForSpl(10000, 0), /too far apart/);
  });
});

describe('combineLevels', () => {
  it('two equal horns add about 3.01 dB', () => {
    close(sl.combineLevels([150, 150]), 150 + 10 * Math.log10(2));
  });
  it('a much quieter source barely changes the total', () => {
    assert.ok(sl.combineLevels([150, 120]) - 150 < 0.005);
  });
  it('handles very large values without overflow', () => {
    close(sl.combineLevels([400, 400]), 400 + 10 * Math.log10(2));
  });
  it('rejects empty input', () => {
    assert.throws(() => sl.combineLevels([]), sl.InputError);
    assert.throws(() => sl.combineLevels('150'), sl.InputError);
  });
});

describe('parsing', () => {
  it('parses distances with and without units', () => {
    assert.deepEqual(sl.parseDistance('100'), { value: 100, unit: null });
    assert.deepEqual(sl.parseDistance('100 ft'), { value: 100, unit: 'ft' });
    assert.deepEqual(sl.parseDistance("100'"), { value: 100, unit: 'ft' });
    assert.deepEqual(sl.parseDistance('30m'), { value: 30, unit: 'm' });
    assert.deepEqual(sl.parseDistance(' 2.5 metres '), { value: 2.5, unit: 'm' });
    assert.deepEqual(sl.parseDistance('12 Feet'), { value: 12, unit: 'ft' });
  });
  it('rejects bad distances', () => {
    assert.throws(() => sl.parseDistance(''), sl.InputError);
    assert.throws(() => sl.parseDistance('ten ft'), sl.InputError);
    assert.throws(() => sl.parseDistance('0 ft'), /greater than 0/);
    assert.throws(() => sl.parseDistance('-3 m'), /greater than 0/);
    assert.throws(() => sl.parseDistance('5 yd'), sl.InputError);
    assert.throws(() => sl.parseDistance(5), sl.InputError);
  });
  it('parses levels', () => {
    assert.equal(sl.parseLevel('150'), 150);
    assert.equal(sl.parseLevel('150 dB'), 150);
    assert.equal(sl.parseLevel('118dBA'), 118);
    assert.equal(sl.parseLevel(' 99.5 '), 99.5);
    assert.throws(() => sl.parseLevel('loud'), sl.InputError);
    assert.throws(() => sl.parseLevel(''), sl.InputError);
  });
});

describe('findRatings', () => {
  it('finds ratings written in several styles', () => {
    const r = sl.findRatings('Kit A: 150 dB @ 10 ft; kit B: 149dB at 3 m; horn C 118 dBA at 1 meter.');
    assert.equal(r.length, 3);
    assert.deepEqual(r.map((x) => [x.db, x.refDistance, x.unit]), [[150, 10, 'ft'], [149, 3, 'm'], [118, 1, 'm']]);
    assert.equal('Kit A: 150 dB @ 10 ft'.slice(r[0].start, r[0].end), '150 dB @ 10 ft');
  });
  it('ignores text without a distance or unit', () => {
    assert.equal(sl.findRatings('rated 150 dB, very loud').length, 0);
    assert.equal(sl.findRatings('150 dB at 10').length, 0);
    assert.equal(sl.findRatings('150 dB at 0 ft').length, 0);
  });
  it('is safe to call repeatedly (global regex state reset)', () => {
    const t = '150 dB @ 10 ft';
    assert.equal(sl.findRatings(t).length, 1);
    assert.equal(sl.findRatings(t).length, 1);
  });
});

describe('levelTable and describeLevel', () => {
  it('builds a default table in feet', () => {
    const rows = sl.levelTable(150, 10, 'ft');
    assert.deepEqual(rows.map((r) => r.distance), sl.TABLE_DISTANCES.ft);
    close(rows[0].db, 150);
    close(rows[2].db, 130);
    close(rows[5].db, 110);
  });
  it('accepts custom distances', () => {
    const rows = sl.levelTable(100, 1, 'm', [10]);
    close(rows[0].db, 80);
  });
  it('describes levels', () => {
    assert.match(sl.describeLevel(150), /pain/);
    assert.match(sl.describeLevel(130), /painfully/);
    assert.match(sl.describeLevel(88), /hearing/);
    assert.equal(sl.describeLevel(30), 'quiet');
  });
  it('rounds without negative zero', () => {
    assert.equal(sl.fmt(-0.01), '0.0');
    assert.equal(sl.fmt(129.96), '130.0');
  });
});

describe('parity with trainhorn-calc (Python core)', () => {
  // Values printed by trainhorn_calc.acoustics 1.0.0 for the same inputs.
  it('spl_at_distance(150, 1000, 10, "ft", 1.9)', () => close(sl.splAtDistance(150, 1000, 10, 'ft', 1.9), 109.4266712, 1e-7));
  it('distance_for_spl(150, 90, 10, "ft", 1.9)', () => close(sl.distanceForSpl(150, 90, 10, 'ft', 1.9), 6491.256148481227, 1e-6));
  it('distance_for_spl(130, 70, 1, "m", 3.7)', () => close(sl.distanceForSpl(130, 70, 1, 'm', 3.7), 732.3263042232177, 1e-6));
});
