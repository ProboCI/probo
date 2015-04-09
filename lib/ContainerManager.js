var http = require('http')
   ,Docker = require('dockerode')
   ,FlakeId = require('flake-idgen')
   ,restify = require('restify')
   ,levelup = require('levelup')
   ,bunyan = require('bunyan')
   ,format  = require('biguint-format')
;

var docker = null;


/**
 * The container manager object that contains all routes.
 */
var Server = function() {
  this.docker = null;
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
  this.flakeIdGen = new FlakeId();
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
  this.db = levelup(amour.config.dataDir, { valueEncoding: 'json' });
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
  this.log = bunyan.createLogger({name: 'container-manager'});
  done();
}

/**
 * Store build data.
 */
Server.prototype.storeBuildData = function(data, done) {
  if (!data.id) {
    data.id = format(this.flakeIdGen.next(), 'hex');
  }
  this.db.put('builds!' + data.id, data, function(error) {
    done(error, data);
  });
};

Server.prototype.routes = {
  get: {},
  post: {},
  put: {},
  del: {},
};

Server.prototype.routes.get['version'] = function(req, res) {
  res.send(require('../package').version);
  var container = self.config.images['lepew/ubuntu-14.04-lamp'];
};

/**
 * Create a new build in a new envrionment.
 */
Server.prototype.routes.post['builds'] = function(req, res) {
  this.storeBuildData(req.body, function(error, data) {
    if (error) {
      res.writeHead(400);
      res.write(error.message);
      return;
    }
    res.send(data);
  });
};

/**
 * List builds on this server.
 */
Server.prototype.routes.get['builds'] = function(req, res) {
  res.writeHead(200);
  res.write("[\n");
  var readStream = this.db.createValueStream({
    gte: 'builds!!',
    lte: 'builds!~',
    valueEncoding: 'json',
  });
  var item = 0;
  readStream.on('data', function(data) {
    if (item > 0) res.write(",\n");
    res.write(JSON.stringify(data) + "\n");
    item++;
  });
  readStream.on('end', function() {
    res.end(']');
  });
};

/**
 * List builds on this server.
 */
Server.prototype.routes.get['builds/:id'] = function(req, res) {
  this.db.get('builds!' + req.params.id, { valueEncoding: 'json' }, function(error, data) {
    if (error) return res.send(404, error);
    res.send(data);
  });
};

/**
 * Delete an individual build.
 */
Server.prototype.routes.del['builds/:id'] = function(req, res) {
  console.log('deleting', req.params.id);
  this.db.del('builds!' + req.params.id, function(error) {
    if (error) return res.send(500, error);
    res.send('success');
  });
};

module.exports = Server;

