"use strict";

var http = require('http')
   ,url = require('url')
   ,Docker = require('dockerode')
   ,Promise = require('bluebird')
   ,co = require('../lib/safeco')
   ,FlakeId = require('flake-idgen')
   ,restify = require('restify')
   ,levelup = require('levelup')
   ,JSONStream = require('JSONStream')
   ,format  = require('biguint-format')
   ,ms  = require('ms')
   ,waitForPort = require('./waitForPort')
   ,Container = require('./Container')
   ,logger = require('./logger')
   ,runBuild = require("./container_manager/build_runner")
;

Promise.longStackTraces();

/**
 * The container manager object that contains all routes.
 */
var Server = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
  this.flakeIdGen = new FlakeId();
  for (let verb in this.routes) {
    for (let route in this.routes[verb]) {
      this.routes[verb][route] = this.routes[verb][route].bind(this);
    }
  }

  this.containerIdleTimeouts = {}
}

/**
 * Starts the server.
 */
Server.prototype.run = function(probo, done) {
  var self = this;
  this.server.listen(probo.config.port, function(error) {
    self.log.info('server started and listening on ' + self.server.url);
    done(error);
  });
}


/**
 * Configures the server.
 */
Server.prototype.configure = function(config, done) {
  var self = this;
  this.config = config;
  this.log = logger.getLogger('container-manager');

  var API = require('./api');

  this.api = API.getAPI({
    url: this.config.api.url,
    token: this.config.api.token,
    log: this.log,
    // TODO: URL for the provider handler
    handler: {},
  });

  var server = restify.createServer({
    name: config.name,
    version: require('../package').version,
    log: this.log.child({component: 'http'}),
  });
  server.use(restify.acceptParser(server.acceptable));
  server.use(restify.bodyParser({ mapParams: false }));
  server.use(restify.queryParser({ mapParams: false }));

  // Extend logger using the plugin.
  server.use(restify.requestLogger({
    serializers: restify.bunyan.serializers
  }));

  server.use(function (req, res, next) {
    req.log.info({req: req}, 'REQUEST');
    next();
  });

  server.on('after', restify.auditLogger({
    log: server.log
  }));

  server.on('uncaughtException', function (req, res, route, err) {
    console.log("uncaughtException", err.stack)
    req.log.error({err: err}, "uncaughtException");
    //err._customContent = 'something is wrong!';
  });

  for (var verb in this.routes) {
    for (var route in this.routes[verb]) {
      server[verb](config.prefix + '/' + route, this.routes[verb][route]);
    }
  }

  this.server = server;
  // Allow the db to be handed in with the config.
  this.db = config.levelupDB || levelup(config.dataDir, { valueEncoding: 'json' });

  // update safeco's error handler with bunyan logging one
  co = co(function(err, opts){
    (opts.req || self).log.error({err: err}, "Uncaught co Exception")

    if(opts.res){
      try {
        opts.res.send(err)
      } catch(e){
        // headers already sent, reponse started
        // write error to the response and end it
        var req_id_str = opts.req ? `(req id ${opts.req.id()})` : ''
        opts.res.end(`\n\nERROR: ${err.message}, terminating response ${req_id_str}`)
      }
    }

    // let middleware continue
    if(opts.next){
      opts.next()
    }
  })

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
Server.prototype.routes.post['startbuild'] = function(req, res, next) {
  var body = req.body, // {build, project}
      build = body.build,
      project = body.project;

  build.project = project;
  var self = this;

  build.active = true;

  co(function* (){
    try {
      yield self.storeBuildDataAsync(build)
    } catch(error){
      req.log.error({err: error}, "Failed to write build to the BD")
      res.json(400, {error: error.message});
      return;
    }

    var image = build.config.image || self.config.defaultImage
    var containerName = `${self.config.containerNamePrefix}--${project.slug.replace('/', '.')}--${project.id}--${build.id}`

    var container_config = {
      // config from the build
      docker: self.config.docker,
      build: build,
      jobConfig: build.config,
      containerName: containerName,
      containerId: containerName,
      image: image,
      imageConfig: self.config.images[image],

      // global config
      binds: self.config.binds,
      // attachLogs: true, // set to true to attach 'docker -f logs' to stdout of this process
    };

    req.log.info(`Starting container build: ${containerName}`)
    // req.log.debug({build, container_config}, "Starting container build")

    // attach logger
    container_config.log = req.log;

    var container = new Container(container_config);

    // gather all the tasks
    var tasks = yield container.buildTasks()

    var updateStatus = function* (context, status){
      try {
        // prefix context with ProboCI namespace
        var instance = self.config.instanceName || 'ProboCI'
        context = `${instance}/${context}`

        yield self.api.setBuildStatusAsync(build, context, status)
        req.log.info({status}, "status updated")
      } catch (e){
        req.log.error({err: e}, "Failed to update build status")
      }
    }

    // handle status updates for each task
    for(let task of tasks){
      task.on("update", function (context, status){
        co(updateStatus(context, status))
      })

      // initialize all tasks in pending state
      task.updateStatus({state: "pending", action: 'pending'})
    }

    yield* updateStatus("env", {state: "pending", action: 'running', description: `The hamsters are working hard on your setup`})

    try {
      yield container.create() // returns output of container.inspect
      yield* updateStatus("env", {state: "success", action: 'finished', description: 'Environment built'})
    } catch(e){
      switch(e.statusCode){

      case 409: // container conflict, reuse existing container
        req.log.warn(`Container ${containerName} is already exists, reusing it if not started`)

        var state = yield container.getState()
        if(state.Running){
          // oh oh, there might be a problem
          req.log.error(`Container ${containerName} is already running, bailing`)
          yield* updateStatus("env", {state: "error", action: 'finished', description: 'Build already in progress'})
          throw new Error(`Build ${build.id} is already in progress`)
        }

        yield container.start()

        yield* updateStatus("env", {state: "success", action: 'finished', description: 'Reusing existing environment'})
        break

      default:
        req.log.error({err: e}, "Unknown container error")
        res.json(500, {error: e.message});

        yield* updateStatus("env", {state: "error", description: e.message})
        return next()
      }
    }

    // return a response to the requestor
    res.json({
      status: "build started",
      container: {
        id: container.container.id || null,
        name: containerName
      },
      build: {
        id: build.id
      },
      steps: tasks.length
    })
    next()

    // continue processing the build and firing off events
    yield* runBuild(tasks, {log: req.log, container: container})

    try {
      build.active = false

      // save the container information for the build
      build.container = {
        id: container.container.id,
        name: containerName
      }

      yield self.storeBuildDataAsync(build)
    } catch(error){
      req.log.error({err: error}, "Failed to write build to the BD")
    }

  }, {req, res, next})
};

/**
 * List active probo containers on the server
 */
Server.prototype.routes.get['containers'] = function(req, res, next) {
  var docker = new Docker(this.config.docker)
  var self = this

  docker.listContainers(function (err, containers) {
    if(err) return next(err)

    function filter(containerInfo){
      // .Names is an array, and first name in array is the main name
      // container names in docker start with a /, so look for our prefix
      // starting with second character (index 1)
      return containerInfo.Names[0].indexOf(self.config.containerNamePrefix) === 1
    }

    function toInstances(containerInfo){
      // return our Container instances
      return new Container({
        docker: self.config.docker,
        containerId: containerInfo.Id,
      })
    }

    containers = containers.filter(filter).map(toInstances)

    co(function*(){
      var inspects = containers.map(function(c){ return c.inspect() })
      var infos = yield inspects // inspect all containers in parallel
      infos = infos.map(function(info){
        return {
          id: info.Id,
          name: info.Name,
          state: info.State,
          ports: info.NetworkSettings.Ports
        }
      })

      res.json({
        capacity: self.config.containerCapacity || -1,
        active:  containers.length,
        containers: infos
      })
      next()
    }, {req, res, next})
  });
};


/**
 * Get information about an active container for a build.
 * Start container if it's not running
 * GET /build/:buildId/container/proxy
 */
Server.prototype.routes.post['builds/:bid/container/proxy'] = function(req, res, next) {
  var self = this

  var buildId = req.params.bid
  if(!buildId){
    return next(new restify.InvalidContentError("bid param required"));
  }

  co(function* (){
    // find build object for our build id
    var build
    try {
      build = yield self.getFromDBAsync('builds', buildId)
    } catch(err){
      if(err.notFound){
        return next(new restify.ResourceNotFoundError("Build not found for build id: " + buildId));
      }
    }

    // lookup container object for the build
    if(!build.container){
      return next(new restify.ResourceNotFoundError("Build does not have an associated container (yet?)"));
    }

    var container = new Container({
      docker: self.config.docker,
      containerId: build.container.id,
    })

    try {
      var state = yield container.getState()
      var setIdleTimeout = false
      if(!state.Running){
        yield container.start()
        setIdleTimeout = true
      } else {
        // 𝅘𝅥𝅮𝅘𝅥𝅮𝅘𝅥𝅮
        // We didn't start the fire
        // It was always burning
        // Since the world's been turning
        // 𝅘𝅥𝅮𝅘𝅥𝅮𝅘𝅥𝅮
      }

      self.resetContainerIdleTimeout(container, setIdleTimeout, req.log)

      // find port 80 mapping for this container
      var targetPort = 80
      var inspectInfo = yield container.inspect()
      var exposedHostPort = container.getExposedPortFromContainerInfo(inspectInfo, targetPort)


      // wait for the port to be up before responding if it's not up yet
      var up = true
      try {
        var start = new Date().getTime()
        var port_opts = { numRetries: 10, retryInterval: 500, debug: req.log.debug.bind(req.log) }
        yield waitForPort('localhost', exposedHostPort, port_opts)
        req.log.debug(`Container port ${targetPort}/${exposedHostPort} up`)
      } catch (e){
        up = false
        var duration = (new Date().getTime()) - start
        req.log.warn(`Service connection timed out (${e}) on container port ${targetPort}/${exposedHostPort} after ${duration}ms. Continuing with proxy response anyway.`)
      }


      // respond with port, host, and build job config
      var url_parts = url.parse('http://' + req.header('host'))
      req.log.debug({url_parts}, "parsed HOST header")
      delete url_parts.host  // if host is set, port isn't used in .format()
      url_parts.port = exposedHostPort

      res.json({
        proxy: {
          host: url_parts.hostname,
          port: url_parts.port,
          url: url.format(url_parts)
        },
        buildConfig: build.config,
        status: {
          up: up,
          info: up ? 'ok' : `Timed out after ${duration}ms`,
          ts: new Date()
        }
      })
      return next()
    } catch(e){
      // problems interacting with the container
      req.log.error({err: e}, "Problem starting or starting container")
      return next(new restify.ResourceNotFoundError("Could not get container, error: " + e.message));
    }
  }, {req, res, next})
}

/**
 * List builds on this server.
 */
Server.prototype.routes.get['builds'] = function(req, res) {
  var readStream = this.streamFromDB('builds')
  var jsonStream  = new JSONStream.stringify()
  readStream.pipe(jsonStream).pipe(res);
};

/**
 * List builds on this server.
 */
Server.prototype.routes.get['builds/:id'] = function(req, res) {
  this.getFromDB('builds', req.params.id, function(error, data) {
    if (error) return res.send(404, error);
    res.send(data);
  });
};

/**
 * Delete an individual build.
 */
Server.prototype.routes.del['builds/:id'] = function(req, res) {
  this.log.info('deleting build ' + req.params.id);
  this.delFromDB('builds', req.params.id, function(error) {
    if (error) return res.send(500, error);
    res.send('success');
  });
};


Server.prototype.resetContainerIdleTimeout = function(container, set, log){
  var idleTimeout = this.config.containerIdleTimeout || "10m"
  var containerId = container.containerId

  var to = this.containerIdleTimeouts[containerId]
  if(set || to){
    // reset timeout if it's already existing, or 'set' flag is set to true (we just started container)

    clearTimeout(to)
    log.info({id: containerId}, `Resetting container idle timeout to ${ms(ms(idleTimeout))}`)

    // stop container after the timeout
    this.containerIdleTimeouts[containerId] = setTimeout(function(){
      log.info({id: containerId}, "Stopping container")
      container.stop()
    }, ms(idleTimeout))
  }
}


/**
 * Store build data.
 */
Server.prototype.storeBuildData = function(data, done) {
  return this.storeInDB("builds", data, done);
};


/**
 * Store data with the specified prefix key. Automatically assings id to data if it's not there
 */
Server.prototype.storeInDB = function(key, data, done) {
  if (!data.id) {
    data.id = format(this.flakeIdGen.next(), 'hex');
  }
  this.db.put(key + '!' + data.id, data, function(error) {
    done(error, data);
  });
};

/**
 * Delete data from db based on key and id
 */
Server.prototype.delFromDB = function(key, id, done) {
  this.db.del(key + '!' + id, done);
};

/**
 * Get value from DB based on key and id
 */
Server.prototype.getFromDB = function(key, id, done) {
  this.db.get(key + '!' + id, { valueEncoding: 'json' }, done);
};

/**
 * Stream data from the db with keys prefixed with 'key'. Data is streamed as JSON objects
 */
Server.prototype.streamFromDB = function(key) {
  var readStream = this.db.createValueStream({
    gte: key + '!!',
    lte: key + '!~',
    valueEncoding: 'json',
  });
  return readStream;
};

Promise.promisifyAll(Server.prototype)

module.exports = Server;
