var exports = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
};

exports.shortDescription = 'Provides the mongo backed REST API server that manages creating and tracking containers.'

exports.help = 'Runs the API server for creating docker containers.';

exports.options = function(yargs) {
  yargs
    .describe('port', 'The port to listen on.')
    .alias('port', 'p')
  ;
}

exports.run = function(amour) {
  var Server = amour.ContainerManager;
  var server = new Server();
  var config = amour.config;
  server.configure(config, function(error) {
    if (error) throw error;
    server.run(amour, function(error) {
      console.log('Listening on ' + config.port);
    });
  });
}

module.exports = exports;
