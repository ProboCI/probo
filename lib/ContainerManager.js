var http = require('http')
   ,FlakeId = require('flake-idgen')
   ,restify = require('restify')
   ,levelup = require('levelup')
   ,bunyan = require('bunyan')
   ,format  = require('biguint-format')
   ,Container = require('./Container')
;

/**
 * The container manager object that contains all routes.
 */
var Server = function() {
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
Server.prototype.run = function(probo, done) {
  var self = this;
  this.server.listen(amour.config.port, function(error) {
    self.log.info('server started and listening on ' + self.server.url);
    done(error);
  });
}


/**
 * Configures the server.
 */
Server.prototype.configure = function(config, done) {
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
  // Allow the db to be handed in with the config.
  this.db = config.levelupDB || levelup(config.dataDir, { valueEncoding: 'json' });
  done();
}

/**
 * Define empty route structures so that it is easy to layer them on below.
 */
Server.prototype.routes = {
  get: {},
  post: {},
  put: {},
  del: {},
};

/**
 * Create a new build in a new envrionment.
 */
Server.prototype.routes.post['startbuild'] = function(req, res) {
  var data = req.body, // {build, project}
      build = data.build,
      project = data.project;

  build.project = project;

  this.storeBuildData(build, function(error, data) {
    if (error) {
      res.writeHead(400);
      res.write(error.message);
      return;
    }

    var container_config = {
      // docker, jobConfig, log, containerName, containerId, image, imageConfig, binds, attachLogs
    };

    var container = new Container(container_config);
    container.runBuild(function(error, data) {
      if (error) {
        res.writeHead(500);
        // TODO: Send some saner error message?
        res.write(JSON.stringify(error));
      }
      res.send(data);
    });
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
  this.log.info('deleting build ' + req.params.id);
  this.db.del('builds!' + req.params.id, function(error) {
    if (error) return res.send(500, error);
    res.send('success');
  });
};


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


module.exports = Server;
