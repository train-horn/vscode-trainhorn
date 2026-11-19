'use strict';
const path = require('node:path');
const Mocha = require('mocha');

function run() {
  const mocha = new Mocha({ ui: 'bdd', timeout: 20000, color: true });
  mocha.addFile(path.resolve(__dirname, 'extension.itest.js'));
  return new Promise((resolve, reject) => {
    mocha.run((failures) => (failures ? reject(new Error(`${failures} tests failed`)) : resolve()));
  });
}

module.exports = { run };
