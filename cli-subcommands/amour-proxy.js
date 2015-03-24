var http = require('http'),
    httpProxy = require('http-proxy');

var exports = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
};

exports.shortDescription = '.';

exports.help = 'Runs the API server for creating docker containers.';

exports.options = function(yargs) {
  return yargs
    .describe('port', 'The port to run on')
    .alias('port', 'p')
  ;
}

module.exports = exports;
