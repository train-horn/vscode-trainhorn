'use strict';
const vscode = require('vscode');
const sl = require('./soundlevel');

const CALCULATOR_URL = 'https://train-horn.com/tools/decibel-distance/';
const NOTE = 'Free-field estimate (inverse-square law), not a measurement or a legal noise assessment.';

function config() {
  return vscode.workspace.getConfiguration('trainhorn');
}

function defaultUnit() {
  const u = config().get('defaultUnit', 'ft');
  return u === 'm' ? 'm' : 'ft';
}

/** Turn a validator that throws into one for showInputBox (returns a message or undefined). */
function validator(parse) {
  return (text) => {
    try {
      parse(text);
      return undefined;
    } catch (err) {
      return err.message;
    }
  };
}

function convert(value, from, to) {
  if (from === to) return value;
  return from === 'ft' ? value * sl.METERS_PER_FOOT : value / sl.METERS_PER_FOOT;
}

/**
 * Pure computation behind the command, given the three typed strings.
 * Exported for tests.
 */
function computeFromInputs(levelText, refText, targetText, fallbackUnit = 'ft') {
  const db = sl.parseLevel(levelText, 'Source level');
  const ref = sl.parseDistance(refText, 'Reference distance');
  const target = sl.parseDistance(targetText, 'Target distance');
  const unit = ref.unit || target.unit || fallbackUnit;
  const refUnit = ref.unit || unit;
  const targetUnit = target.unit || unit;
  const targetInRefUnit = convert(target.value, targetUnit, refUnit);
  const result = sl.splAtDistance(db, targetInRefUnit, ref.value, refUnit);
  return {
    db,
    ref: { value: ref.value, unit: refUnit },
    target: { value: target.value, unit: targetUnit },
    result,
    change: result - db,
    summary:
      `${sl.fmt(db)} dB at ${ref.value} ${refUnit} → ${sl.fmt(result)} dB at ${target.value} ${targetUnit} ` +
      `(${result - db <= 0 ? '−' : '+'}${sl.fmt(Math.abs(result - db))} dB)`,
  };
}

async function showResult(text) {
  const choice = await vscode.window.showInformationMessage(`${text}. ${NOTE}`, 'Copy', 'Open web calculator');
  if (choice === 'Copy') {
    await vscode.env.clipboard.writeText(text);
  } else if (choice === 'Open web calculator') {
    await vscode.env.openExternal(vscode.Uri.parse(CALCULATOR_URL));
  }
  return choice;
}

/** Command: Train Horn: Sound level at distance. Returns the computation or undefined if cancelled. */
async function soundLevelAtDistance() {
  const unit = defaultUnit();
  const levelText = await vscode.window.showInputBox({
    title: 'Train Horn: Sound level at distance (1/3)',
    prompt: 'Rated or measured level in dB (e.g. 150 for a horn rated "150 dB at 10 ft")',
    value: '150',
    validateInput: validator((t) => sl.parseLevel(t, 'Source level')),
  });
  if (levelText === undefined) return undefined;
  const refText = await vscode.window.showInputBox({
    title: 'Train Horn: Sound level at distance (2/3)',
    prompt: 'Reference distance the rating applies to (e.g. "10 ft" or "1 m")',
    value: unit === 'm' ? '3 m' : '10 ft',
    validateInput: validator((t) => sl.parseDistance(t, 'Reference distance')),
  });
  if (refText === undefined) return undefined;
  const targetText = await vscode.window.showInputBox({
    title: 'Train Horn: Sound level at distance (3/3)',
    prompt: 'Distance where you want the level (e.g. "100 ft" or "30 m")',
    value: unit === 'm' ? '30 m' : '100 ft',
    validateInput: validator((t) => sl.parseDistance(t, 'Target distance')),
  });
  if (targetText === undefined) return undefined;
  try {
    const r = computeFromInputs(levelText, refText, targetText, unit);
    showResult(`${r.summary}, ${sl.describeLevel(r.result)} (approx.)`);
    return r;
  } catch (err) {
    vscode.window.showErrorMessage(`Train Horn: ${err.message}`);
    return undefined;
  }
}

/** Command: Train Horn: Distance for target level. */
async function distanceForLevel() {
  const unit = defaultUnit();
  const levelText = await vscode.window.showInputBox({
    title: 'Train Horn: Distance for target level (1/3)',
    prompt: 'Rated or measured level in dB',
    value: '150',
    validateInput: validator((t) => sl.parseLevel(t, 'Source level')),
  });
  if (levelText === undefined) return undefined;
  const refText = await vscode.window.showInputBox({
    title: 'Train Horn: Distance for target level (2/3)',
    prompt: 'Reference distance the rating applies to',
    value: unit === 'm' ? '3 m' : '10 ft',
    validateInput: validator((t) => sl.parseDistance(t, 'Reference distance')),
  });
  if (refText === undefined) return undefined;
  const targetText = await vscode.window.showInputBox({
    title: 'Train Horn: Distance for target level (3/3)',
    prompt: 'Target level in dB (e.g. 85)',
    value: '85',
    validateInput: validator((t) => sl.parseLevel(t, 'Target level')),
  });
  if (targetText === undefined) return undefined;
  try {
    const db = sl.parseLevel(levelText, 'Source level');
    const ref = sl.parseDistance(refText, 'Reference distance');
    const refUnit = ref.unit || unit;
    const target = sl.parseLevel(targetText, 'Target level');
    const d = sl.distanceForSpl(db, target, ref.value, refUnit);
    const other = refUnit === 'ft' ? `${sl.fmt(d * sl.METERS_PER_FOOT)} m` : `${sl.fmt(d / sl.METERS_PER_FOOT)} ft`;
    const text = `${sl.fmt(db)} dB at ${ref.value} ${refUnit} falls to ${sl.fmt(target)} dB at about ${sl.fmt(d)} ${refUnit} (${other})`;
    showResult(text);
    return { distance: d, unit: refUnit, text };
  } catch (err) {
    vscode.window.showErrorMessage(`Train Horn: ${err.message}`);
    return undefined;
  }
}

/** Markdown hover for a rating like "150 dB @ 10 ft". Exported for tests. */
function hoverMarkdown(rating) {
  const rows = sl.levelTable(rating.db, rating.refDistance, rating.unit);
  const lines = [
    `**${sl.fmt(rating.db)} dB at ${rating.refDistance} ${rating.unit}**, free-field estimate`,
    '',
    `| Distance | Level |`,
    `|---:|---:|`,
    ...rows.map((r) => `| ${r.distance} ${rating.unit} | ${sl.fmt(r.db)} dB |`),
    '',
    `−6.0 dB per doubling of distance. ${NOTE} [Web calculator](${CALCULATOR_URL})`,
  ];
  return lines.join('\n');
}

const hoverProvider = {
  provideHover(document, position) {
    if (!config().get('hover.enabled', true)) return undefined;
    const line = document.lineAt(position.line).text;
    const hit = sl.findRatings(line).find((r) => position.character >= r.start && position.character <= r.end);
    if (!hit) return undefined;
    const md = new vscode.MarkdownString(hoverMarkdown(hit));
    md.isTrusted = false;
    return new vscode.Hover(md, new vscode.Range(position.line, hit.start, position.line, hit.end));
  },
};

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('trainhorn.soundLevelAtDistance', soundLevelAtDistance),
    vscode.commands.registerCommand('trainhorn.distanceForLevel', distanceForLevel),
    vscode.languages.registerHoverProvider(
      [{ scheme: 'file' }, { scheme: 'untitled' }],
      hoverProvider,
    ),
  );
  return { soundlevel: sl, computeFromInputs };
}

function deactivate() {}

module.exports = { activate, deactivate, computeFromInputs, hoverMarkdown, CALCULATOR_URL };
