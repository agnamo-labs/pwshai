// Wind CLI & Effects programmatic module exports

const windPalettes = require('./wind-palettes');
const windEffects = require('./wind-effects');
const tteBridge = require('./tte-bridge');
const config = require('./config');
const executor = require('./executor');
const doctor = require('./doctor');

module.exports = {
  ...windPalettes,
  ...windEffects,
  ...tteBridge,
  ...config,
  ...executor,
  ...doctor
};
