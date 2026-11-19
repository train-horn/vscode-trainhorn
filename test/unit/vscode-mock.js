'use strict';
/**
 * Minimal in-memory stand-in for the `vscode` module so extension.js can be
 * exercised in plain Node/mocha. Behaviour is scripted per test via `state`.
 */
const Module = require('node:module');

const state = {
  inputs: [],
  inputBoxCalls: [],
  infoMessages: [],
  errorMessages: [],
  infoChoice: undefined,
  clipboard: undefined,
  opened: [],
  commands: new Map(),
  hoverProviders: [],
  config: {},
};

function reset() {
  state.inputs = [];
  state.inputBoxCalls = [];
  state.infoMessages = [];
  state.errorMessages = [];
  state.infoChoice = undefined;
  state.clipboard = undefined;
  state.opened = [];
  state.commands = new Map();
  state.hoverProviders = [];
  state.config = {};
}

class MarkdownString {
  constructor(value) { this.value = value; }
}
class Range {
  constructor(sl, sc, el, ec) { Object.assign(this, { sl, sc, el, ec }); }
}
class Hover {
  constructor(contents, range) { this.contents = contents; this.range = range; }
}

const vscode = {
  MarkdownString,
  Range,
  Hover,
  Uri: { parse: (s) => ({ toString: () => s }) },
  window: {
    async showInputBox(opts) {
      state.inputBoxCalls.push(opts);
      const v = state.inputs.shift();
      if (v !== undefined && opts.validateInput) {
        const msg = opts.validateInput(v);
        if (msg) throw new Error(`mock: input "${v}" rejected by validator: ${msg}`);
      }
      return v;
    },
    async showInformationMessage(msg, ...items) {
      state.infoMessages.push({ msg, items });
      return state.infoChoice;
    },
    async showErrorMessage(msg) {
      state.errorMessages.push(msg);
    },
  },
  env: {
    clipboard: { async writeText(t) { state.clipboard = t; } },
    async openExternal(uri) { state.opened.push(uri.toString()); return true; },
  },
  workspace: {
    getConfiguration() {
      return { get: (key, dflt) => (key in state.config ? state.config[key] : dflt) };
    },
  },
  commands: {
    registerCommand(id, fn) { state.commands.set(id, fn); return { dispose() {} }; },
    executeCommand(id, ...args) { return state.commands.get(id)(...args); },
  },
  languages: {
    registerHoverProvider(selector, provider) { state.hoverProviders.push({ selector, provider }); return { dispose() {} }; },
  },
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function resolve(request, ...rest) {
  if (request === 'vscode') return 'vscode';
  return origResolve.call(this, request, ...rest);
};
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscode };

module.exports = { vscode, state, reset };
