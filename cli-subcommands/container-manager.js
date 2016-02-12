'use strict';

var logger = require('../lib/logger');

var exports = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
};

exports.shortDescription = 'Provides the mongo backed REST API server that manages creating and tracking containers.';

exports.help = 'Runs the API server for creating docker containers.';

exports.options = function(yargs) {
  return yargs
    .describe('port', 'The port to listen on.')
    .alias('port', 'p')
    .describe('data-dir', 'The directory to store data in via leveldb.')
    .alias('data-dir', 'd')
    .describe('jwt-public-key', 'An RSA key in PEM format. This should be the contents of the key and NOT a path to the file.')
    .alias('jwt-public-key', 'k')
  ;
};

exports.run = function(amour) {
  var Server = amour.ContainerManager;
  var server = new Server();
  var config = amour.config;
  process.title = 'probo-cm';
  server.configure(config, function(error) {
    if (error) throw error;
    server.run(amour, function(error) {
      logger.getLogger('container-manager')
        .info({config}, `Listening on ${config.port}`);
    });
  });
};

module.exports = exports;
