"use strict";

var http = require('http')
   ,Promise = require('bluebird')
   ,co = require('../lib/safeco')
   ,wait = require('co-wait')
   ,read = require('co-read')
   ,FlakeId = require('flake-idgen')
   ,restify = require('restify')
   ,levelup = require('levelup')
   ,format  = require('biguint-format')
   ,Container = require('./Container')
   ,logger = require('./logger')
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
  this.config = config
  this.log = logger.getLogger('container-manager');

  var API = require('./api');

  this.api = API.getAPI({
    url: this.config.api.url,
    token: this.config.api.token,
    log: this.log,
    handler: {},  // TODO: URL for the provider handler
  })

  var server = restify.createServer({
    name: config.name,
    version: require('../package').version,
    log: this.log.child({component: 'http'}),
  });
  server.use(restify.acceptParser(server.acceptable));
  server.use(restify.queryParser());
  server.use(restify.bodyParser());

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
  var steps

  co(function* (){
    try {
      yield self.storeBuildData(build)
    } catch(error){
      req.log.error({err: error}, "Failed to write build to the BD")
      res.json(400, {error: error.message});
      return;
    }

    var image = build.config.image || self.config.defaultImage
    var containerName = `probo-${project.slug.replace('/', '.')}-${project.id}-${build.id}`

    var container_config = {
      // config from the build
      docker: self.config.docker,
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

    var icons = {
      running: "➠",
      pending: "⌛",
      finished: "✔"
    }

    var statusUpdater = function(build, context){
      var postStatus = Promise.promisify(self.api.setBuildStatus.bind(self.api))

      return function* (status){
        try {
          yield postStatus(build, `probo/${context}`, status)

          req.log.info({status}, "status updated")
        } catch (e){
          req.log.error({err: e}, "Failed to update build status")
        }
      }
    }

    var updateEnvStatus = statusUpdater(build, "env")

    // gather all the tasks
    var tasks = yield container.buildTasks()

    yield updateEnvStatus({state: "pending", description: `[${icons.running}] The hamsters are working hard on your setup`})
    for(let task of tasks){
      // first, set all tasks to pending state
      let task_slug = `${task.options.plugin}/${task.name}`
      task.updateStatus = statusUpdater(build, task_slug)
      yield task.updateStatus({state: "pending", description: `[${icons.pending}] ${task.description()}`})
    }

    // we're in no hurry!
    yield wait(5000)

    try {
      yield container.create() // returns output of container.inspect
      yield updateEnvStatus({state: "success", description: `[${icons.finished}] Environment built`})
    } catch(e){
      switch(e.statusCode){
      case 409: // container conflict, reuse existing container
        req.log.info(`Container ${containerName} is already running, reusing it`)
        break
      default:
        req.log.error({err: e}, "Unknown container error")
        res.json(500, {error: e.message});

        yield updateEnvStatus({state: "error", description: e.message})
        return next()
      }
    }

    // we're in no hurry!
    yield wait(2000)

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
    var log = req.log
    try {
      // steps is an array of Plugins with promisified run methods
      for(let task of tasks){
        // first, yield step to kick off the run
        log.debug("Kicking off step")

        log.debug("Step exec started:", task.name)

        // let updateTaskStatus = statusUpdater(build, task_slug)
        yield task.updateStatus({state: "pending", description: `[${icons.running}] ${task.description()}`})

        let result = yield task.run

        try {
          // stream output back to the log (for now)
          log.debug(`${task.name} OUTPUT`)
          var chunk
          while((chunk = yield read(result.stream))){
            log.debug(chunk.toString().trim())
          }

          // check exit code
          var data = yield result.exec // returns result of container.inspect call
          var exit_code = data.ExitCode
          log.debug(`EXIT_CODE: ${exit_code}`)

          yield task.updateStatus({
            state: exit_code === 0 ? "success" : "error",
            description: `[${icons.finished}] ${task.description()}`
          })
        } catch(e){
          log.error({err: e}, "Task execution failed")

          yield task.updateStatus({state: "error", description: e.message})
        }
      }

      log.debug('ALL STEPS COMPLETED')
    } catch(error){
      log.error({err: error}, "Error processing steps")
    }
  }, {req, res, next})
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
Server.prototype.storeBuildData = Promise.promisify(function(data, done) {
  if (!data.id) {
    data.id = format(this.flakeIdGen.next(), 'hex');
  }
  this.db.put('builds!' + data.id, data, function(error) {
    done(error, data);
  });
});


module.exports = Server;
