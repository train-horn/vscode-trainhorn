'use strict';
const assert = require('node:assert/strict');
const { state, reset } = require('./vscode-mock');
const ext = require('../../src/extension');

const tick = () => new Promise((r) => setImmediate(r));

function activate() {
  const context = { subscriptions: [] };
  const api = ext.activate(context);
  return { context, api };
}

describe('extension (mocked vscode API)', () => {
  beforeEach(reset);

  it('registers both commands and a hover provider', () => {
    const { context, api } = activate();
    assert.deepEqual([...state.commands.keys()].sort(), ['trainhorn.distanceForLevel', 'trainhorn.soundLevelAtDistance']);
    assert.equal(state.hoverProviders.length, 1);
    assert.equal(context.subscriptions.length, 3);
    assert.equal(typeof api.computeFromInputs, 'function');
  });

  it('command: 150 dB, 10 ft, 100 ft -> 130.0 dB, with Copy', async () => {
    activate();
    state.inputs = ['150', '10 ft', '100 ft'];
    state.infoChoice = 'Copy';
    const r = await state.commands.get('trainhorn.soundLevelAtDistance')();
    assert.equal(r.result.toFixed(1), '130.0');
    assert.equal(state.inputBoxCalls.length, 3);
    await tick();
    assert.equal(state.infoMessages.length, 1);
    assert.match(state.infoMessages[0].msg, /150\.0 dB at 10 ft → 130\.0 dB at 100 ft \(−20\.0 dB\)/);
    assert.match(state.infoMessages[0].msg, /not a measurement/);
    assert.match(state.clipboard, /130\.0 dB at 100 ft/);
  });

  it('command: Open web calculator opens train-horn.com tool', async () => {
    activate();
    state.inputs = ['150', '10', '100'];
    state.infoChoice = 'Open web calculator';
    await state.commands.get('trainhorn.soundLevelAtDistance')();
    await tick();
    assert.deepEqual(state.opened, ['https://train-horn.com/tools/decibel-distance/']);
  });

  it('command: cancelling any input box returns undefined and shows nothing', async () => {
    activate();
    state.inputs = ['150', undefined];
    const r = await state.commands.get('trainhorn.soundLevelAtDistance')();
    assert.equal(r, undefined);
    assert.equal(state.infoMessages.length, 0);
  });

  it('input validators reject bad text with a message', async () => {
    activate();
    state.inputs = [];
    await state.commands.get('trainhorn.soundLevelAtDistance')();
    const v = state.inputBoxCalls[0].validateInput;
    assert.equal(v('150'), undefined);
    assert.match(v('loud'), /decibels/);
  });

  it('uses the metric defaults when trainhorn.defaultUnit = m', async () => {
    activate();
    state.config = { defaultUnit: 'm' };
    state.inputs = ['149', undefined];
    await state.commands.get('trainhorn.soundLevelAtDistance')();
    assert.equal(state.inputBoxCalls[1].value, '3 m');
  });

  it('distance-for-level command: 150 dB @ 10 ft reaches 130 dB at 100 ft', async () => {
    activate();
    state.inputs = ['150', '10 ft', '130'];
    const r = await state.commands.get('trainhorn.distanceForLevel')();
    assert.ok(Math.abs(r.distance - 100) < 1e-9);
    assert.match(r.text, /about 100\.0 ft \(30\.5 m\)/);
  });

  it('hover shows a table for "150 dB @ 10 ft" and nothing elsewhere', () => {
    activate();
    const { provider } = state.hoverProviders[0];
    const doc = { lineAt: () => ({ text: 'Rated 150 dB @ 10 ft by the maker.' }) };
    const h = provider.provideHover(doc, { line: 0, character: 8 });
    assert.ok(h);
    assert.match(h.contents.value, /\| 100 ft \| 130\.0 dB \|/);
    assert.match(h.contents.value, /\| 1000 ft \| 110\.0 dB \|/);
    assert.equal(h.range.sc, 6);
    assert.equal(provider.provideHover(doc, { line: 0, character: 30 }), undefined);
  });

  it('hover can be disabled in settings', () => {
    activate();
    state.config = { 'hover.enabled': false };
    const doc = { lineAt: () => ({ text: '150 dB @ 10 ft' }) };
    assert.equal(state.hoverProviders[0].provider.provideHover(doc, { line: 0, character: 2 }), undefined);
  });
});

describe('computeFromInputs', () => {
  it('converts mixed units (reference in ft, target in m)', () => {
    const r = ext.computeFromInputs('150', '10 ft', '30.48 m');
    assert.ok(Math.abs(r.result - 130) < 1e-9);
    assert.equal(r.target.unit, 'm');
  });
  it('falls back to the given unit when none typed', () => {
    const r = ext.computeFromInputs('100', '1', '10', 'm');
    assert.equal(r.ref.unit, 'm');
    assert.ok(Math.abs(r.result - 80) < 1e-9);
  });
  it('shows a + sign when the target is closer', () => {
    assert.match(ext.computeFromInputs('150', '10', '5').summary, /\(\+6\.0 dB\)/);
  });
  it('throws InputError on bad text', () => {
    assert.throws(() => ext.computeFromInputs('x', '10', '100'), /Source level/);
  });
});
