'use strict';

var exports = function() {};

exports.shortDescription = 'Displays version information.';

exports.run = function(probo) {
  console.log(require('../package').version);
};

module.exports = exports;
