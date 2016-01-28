'use strict';

var yaml = require('js-yaml');

var exports = function() {};

exports.shortDescription = 'Displays all loaded configuration.';
exports.help = 'Specify configuration include paths with `-c` or `--config` and use this command to view the compiled configuration.';

exports.configure = function(config) {
  this.config = config;
};

exports.run = function(probo) {
  console.log(yaml.safeDump(this.config));
};

module.exports = exports;
