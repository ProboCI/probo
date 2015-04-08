var http = require('http'),
    httpProxy = require('http-proxy'),
    redis = require('redis'),
    Docker = require('dockerode'),
    restify = require('restify');

var docker = null;

/**
 * The container manager object that contains all routes.
 */
var Server = function() {
  this.docker = null;
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
  var verb = null;
  for (verb in this.routes) {
    var route = null;
    for (route in this.routes[verb]) {
      this.routes[verb][route] = this.routes[verb][route].bind(this);
    }
  }
}

/**
 * Starts the server.
 */
Server.prototype.run = function(amour, done) {
  this.server.listen(amour.config.port, done);
}


/**
 * Configures the server.
 */
Server.prototype.configure = function(config, done) {
  this.docker = new Docker({socketPath: '/var/run/docker.sock'});
  var server = restify.createServer({
    name: config.name,
    version: require('../package').version,
  });
  server.use(restify.acceptParser(server.acceptable));
  server.use(restify.queryParser());
  server.use(restify.bodyParser());
  for (var verb in this.routes) {
    for (var route in this.routes[verb]) {
      server[verb](config.prefix + '/' + route, this.routes[verb][route]);
    }
  }
  this.server = server;
  done();
}

Server.prototype.routes = {
  get: {},
  post: {},
  put: {},
  delete: {},
};

Server.prototype.routes.get['version'] = function(req, res) {
  res.send(require('../package').version);
  var container = self.config.images['lepew/ubuntu-14.04-lamp'];
};

Server.prototype.routes.post['job'] = function(req, res) {
};

module.exports = Server;

/*
*/


