var exports = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
};

exports.shortDescription = 'Provides the mongo backed REST API server that manages creating and tracking containers.'

exports.options = function(yargs) {
  yargs
    .describe('port', 'The port to listen on.')
    .alias('port', 'p')
  ;
}

exports.configure = function(config) {
  this.config = config;
};

exports.run = function(amour) {
  //console.log(this.config);
}

module.exports = exports;
