var http = require('http'),
    httpProxy = require('http-proxy'),
    redis = require('redis'),
    Docker = require('dockerode'),
    restify = require('restify');

var docker = null;

var Server = function() {
  this.docker = null;
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
}

Server.prototype.run = function(amour, done) {
  this.server.listen(amour.config.port, done);
}


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
  var command = [ 'penelope' ];
  for (i in container.services) {
    var service = container.service[i];
    command.push();
  }
  // this.docker.run('lepew/ubuntu-14.04-lamp', 
}.bind(Server);

module.exports = Server;

/*
var proxy = httpProxy.createProxyServer({});

var server = http.createServer(function(req, res) {
  var hostname = req.headers.host;
  lookupPort(hostname.substr(0, hostname.length - ('local'.length + 1)), 80, function(error, port) {
    if (error) {
      res.writeHead(500);
      res.end('The host could not be found...');
    }
    else {
      proxy.on('error', function(error) {
        res.end('An error occurred: ' + error.message);
      });
      var options = {
        target: 'http://127.0.0.1:' + port,
        xfwd: true,
      };
      proxy.web(req, res, options);
    }
  });
});

server.on('upgrade', function (req, socket, head) {
  proxy.ws(req, socket, head);
});
server.listen(80);

function lookupPort(containerName, port, done) {
  var container = docker.getContainer(containerName);
  container.inspect(function (error, data) {
    if (error || !(data && data.NetworkSettings && data.NetworkSettings.Ports &&  data.NetworkSettings.Ports[port + '/tcp'][0].HostPort)) {
      return done(new Error('Could not find tcp port ' + port + ' on container ' + containerName));
    }
    else {
      done(null, data.NetworkSettings.Ports[port + '/tcp'][0].HostPort);
    }
  });
}
*/


