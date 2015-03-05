var glob = require('glob'),
    path = require('path');

var exports = function() {};

exports.loadCommands = function(done) {
  glob(__dirname + '/../bin/*.js', function(error, files) {
    if (error) return done(error);
    var commands = {};
    for (i in files) {
      var filePath = files[i];
      var baseName = path.basename(filePath);
      var commandName = baseName.substr(6, baseName.length - 9);
      commands[commandName] = require(filePath);
    }
    done(null, commands);
  });
}

module.exports = exports;
