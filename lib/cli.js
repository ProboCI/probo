'use strict';

var glob = require('glob');
var path = require('path');

var exports = function() {};

exports.loadCommands = function(done) {
  glob(__dirname + '/../cli-subcommands/*.js', function(error, files) {
    if (error) return done(error);
    var commands = {};
    for (let filePath of files) {
      var baseName = path.basename(filePath);
      var commandName = baseName.substr(0, baseName.length - 3);
      commands[commandName] = require(filePath);
    }
    done(null, commands);
  });
};

module.exports = exports;
