'use strict';

var yaml = require('js-yaml');

var exports = function() {};

exports.shortDescription = 'Displays all loaded configuration.'

exports.configure = function(config) {
  this.config = config;
};

exports.run = function(amour) {
  console.log(yaml.safeDump(this.config));
}

module.exports = exports;
