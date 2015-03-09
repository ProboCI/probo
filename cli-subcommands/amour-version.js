'use strict';

var exports = function() {};

exports.shortDescription = 'Displays version information.'

exports.run = function(amour) {
  console.log(require('../package').version);
}

module.exports = exports;
