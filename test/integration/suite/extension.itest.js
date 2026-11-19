'use strict';
const assert = require('node:assert/strict');
const vscode = require('vscode');

const ID = 'train-horn.trainhorn-sound-level';

describe('Train Horn Sound Level in a real extension host', () => {
  let api;

  before(async () => {
    const ext = vscode.extensions.getExtension(ID);
    assert.ok(ext, `extension ${ID} not found`);
    api = await ext.activate();
  });

  it('registers the commands', async () => {
    const all = await vscode.commands.getCommands(true);
    assert.ok(all.includes('trainhorn.soundLevelAtDistance'));
    assert.ok(all.includes('trainhorn.distanceForLevel'));
  });

  it('exposes the math API: 150 dB @ 10 ft -> 130.0 dB @ 100 ft', () => {
    assert.equal(api.soundlevel.splAtDistance(150, 100, 10, 'ft').toFixed(1), '130.0');
    assert.equal(api.computeFromInputs('150', '10 ft', '100 ft').result.toFixed(1), '130.0');
  });

  it('provides a hover table for a rating in a document', async () => {
    const doc = await vscode.workspace.openTextDocument({ content: 'Rated 150 dB @ 10 ft.', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', doc.uri, new vscode.Position(0, 9));
    const text = hovers.flatMap((h) => h.contents.map((c) => (typeof c === 'string' ? c : c.value))).join('\n');
    assert.match(text, /\| 100 ft \| 130\.0 dB \|/);
  });
});
