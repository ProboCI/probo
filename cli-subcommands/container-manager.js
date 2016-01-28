'use strict';

var logger = require('../lib/logger');

var exports = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
};

exports.shortDescription = 'Provides the REST API server that manages the lifecycle of environment containers.';

exports.help = 'Runs the API server for creating docker containers.';

exports.options = function(yargs) {
  return yargs
    .describe('port', 'The port to listen on.')
    .alias('port', 'p')
    .describe('data-dir', 'The directory to store data in via leveldb.')
    .alias('data-dir', 'd')
  ;
};

exports.run = function(probo) {
  var Server = probo.ContainerManager;
  var server = new Server();
  var config = probo.config;
  process.title = 'probo-cm';
  server.configure(config, function(error) {
    if (error) throw error;
    server.run(probo, function(error) {
      logger.getLogger('container-manager')
        .debug({config}, `Listening on ${config.port}`);
    });
  });
};

module.exports = exports;
