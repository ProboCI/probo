/* eslint dot-notation: 1 */
'use strict';

var url = require('url');
var Docker = require('dockerode');
var Promise = require('bluebird');
var co = require('../lib/safeco');
var FlakeId = require('flake-idgen');
var restify = require('restify');
var level = require('level');
var JSONStream = require('JSONStream');
var format = require('biguint-format');
var through2 = require('through2');
var async = require('async');
var ms = require('ms');
var _ = require('lodash');
var wait = require('co-wait');
var waitForPort = require('./waitForPort');
var Container = require('./Container');
var logger = require('./logger');
var runTasks = require('./container_manager/task_runner');
var loom = require('./loom');
var eventbus = require('probo-eventbus');

Promise.longStackTraces();

const SETUP_CONTEXT = 'env';

var logContainerEvents = function(container) {
  container.on('stateChange', function(event, err, data) {
    container.log.debug({event, err, data, build: container.build}, `container event ${container.containerId}: '${event}', err:${err ? err.json.trim() : false}`);
  });
};

var emitBuildEvent = function(build, event, data, opts) {
  opts = opts || {};

  if (opts.log) {
    opts.log.debug({event, data}, `build event for build ${build.id}: ${event}`);
  }

  // Send the event to the event bus.
  if (opts.producer) {
    opts.producer.stream.write({event, data, build});
  }
};


/**
 * The container manager object that contains all routes.
 */
var Server = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
  this.flakeIdGen = new FlakeId();

  for (let verb in this.routes) {
    if (this.routes.hasOwnProperty(verb)) {
      for (let route in this.routes[verb]) {
        if (this.routes[verb].hasOwnProperty(route)) {
          this.routes[verb][route] = this.routes[verb][route].bind(this);
        }
      }
    }
  }

  this.containerIdleTimeouts = {};
};

Server.prototype.run = function(probo, done) {
  var self = this;
  this.server.listen(probo.config.port, probo.config.host, function(error) {
    self.log.info('server started and listening on ' + self.server.url);
    done(error);
  });
};


Server.prototype.configure = function(config, done) {
  var self = this;
  this.config = config;
  // TODO: We should probably be injecting this logger.
  this.log = logger.getLogger('container-manager');

  var API = require('./api');

  this.api = API.getAPI({
    url: this.config.api.url,
    token: this.config.api.token,
    buildUrl: this.config.buildUrl,
    log: this.log,
  });

  var server = restify.createServer({
    name: config.name,
    version: require('../package').version,
    log: this.log.child({component: 'http'}),
  });
  server.use(restify.acceptParser(server.acceptable));
  server.use(restify.bodyParser({mapParams: false}));
  server.use(restify.queryParser({mapParams: false}));

  // Extend logger using the plugin.
  server.use(restify.requestLogger({
    serializers: restify.bunyan.serializers,
  }));

  server.use(function(req, res, next) {
    req.log.info({req: req}, 'REQUEST');
    next();
  });

  server.on('after', restify.auditLogger({
    log: server.log,
  }));

  server.on('uncaughtException', function(req, res, route, err) {
    console.log('uncaughtException', err.stack);
    req.log.error({err: err}, 'uncaughtException');
    // err._customContent = 'something is wrong!';
  });

  for (let verb in this.routes) {
    if (this.routes.hasOwnProperty(verb)) {
      for (let route in this.routes[verb]) {
        if (this.routes[verb].hasOwnProperty(route)) {
          server[verb](config.prefix + '/' + route, this.routes[verb][route]);
        }
      }
    }
  }

  this.server = server;
  // Allow the db to be handed in with the config.
  this.db = config.levelupDB || level(config.dataDir, {valueEncoding: 'json'});

  this.loom = loom(config.loom, this.log);

  // update safeco's error handler with bunyan logging one
  co = co(function(err, opts) {
    (opts.req || self).log.error({err: err}, 'Uncaught co Exception');

    if (opts.res) {
      try {
        opts.res.send(err);
      }
      catch (e) {
        // headers already sent, reponse started
       // write error to the response and end it
        var reqIdStr = opts.req ? `(req id ${opts.req.id()})` : '';
        opts.res.end(`\n\nERROR: ${err.message}, terminating response ${reqIdStr}`);
      }
    }

    // let middleware continue
    if (opts.next) {
      opts.next();
    }
  });


  // configure event streaming system for builds
  try {
    new eventbus.plugins[config.buildsEventStream.plugin].Producer(config.buildsEventStream.config, function(error, producer) {
      console.log('connected to eventbus.');
      if (error) {
        server.log.error({err: error}, `Failed to activate build stream producer: ${error.message}`);
      }

      self.buildsEventProducer = producer;
      done(error);
    });
  }
  catch (e) {
    server.log.error({err: e}, `Failed to instantiate build stream producer plugin: ${e.message}`);
  }
};

/**
 * Define empty route structures so that it is easy to layer them on below.
 */
Server.prototype.routes = {
  get: {},
  post: {},
  put: {},
  del: {},
};

Server.prototype.routes.post['start-build'] = function(req, res, next) {
  var body = req.body;
  var build = body.build;
  var project = body.project;

  req.log.debug(body, 'Starting Build');

  req.buildId = build.id;
  build.project = project;
  var self = this;

  co(function* () {
    try {
      var result = yield self.runBuild(build, req.log);
      res.json(result);
    }
    catch (error) {
      var status = error.status || 500;
      res.json(status, {error: error.message});
      req.log.error({err: error});
    }
    return next();
  }, {req, res, next});
};
// Provide a backward compatible alias to our old path.
Server.prototype.routes.post.startbuild = Server.prototype.routes.post['start-build'];

Server.prototype.runBuild = function* (build, log) {
  var self = this;

  log = log.child({bid: build.id}, true);

  build.active = true;
  var project = build.project;

  try {
    yield self.storeBuildDataAsync(build);
  }
  catch (error) {
    log.error({err: error}, 'Failed to write build to the BD');
    error.status = 400;
    throw error;
  }

  var image = build.config.image || this.config.defaultImage;
  var containerName = `${self.config.containerNamePrefix}--${project.slug.replace('/', '.')}--${project.id}--${build.id}`;

  var containerConfig = {
    // Configuration specific to this build.
    docker: self.config.docker,
    build: build,
    jobConfig: build.config,
    containerName: containerName,
    containerId: containerName,
    image: image,
    imageConfig: self.config.images[image],

    // Global configuration for what binds to expose to all containers.
    binds: self.config.binds,
    // attachLogs: true, // set to true to attach 'docker -f logs' to stdout of this process

    // TODO: Can we have a more generic way of passing plugin config through
    // without explicit knowledge of plugin configuration here?
    assets: this.config.assets,

    // auth credentials service (i.e., for stash)
    authUrl: this.config.auth.url,

    // Attach our our logger to the request options.
    log: log,
  };

  log.debug({build, containerConfig: _.merge(containerConfig, {log: {}})}, `Starting container build: ${containerName}`);
  log.info(`Starting container build: ${containerName}`);

  // attach logger
  containerConfig.log = log;

  var container = new Container(containerConfig);
  logContainerEvents(container);

  // gather all the tasks
  var setupTasks = yield container.buildSetupTasks();
  var userTasks = yield container.buildUserTasks();

  var updateStatus = function* (context, status) {
    try {
      // prefix context with ProboCI namespace
      var instance = self.config.instanceName || 'ProboCI';
      context = `${instance}/${context}`;

      let processedStatus = yield self.api.setBuildStatusAsync(build, context, status);

      // TODO: we can add this for completeness, but it's probably not really necessary and could be confusing upstream
      // build.statuses[context] = processedStatus;

      // emit a status update event on the container so the status update gets logged and sent to the event stream
      emitBuildEvent(build, 'status updated', {context, status: processedStatus}, {log, producer: self.buildsEventProducer});

      log.info({status: _.pick(status, 'state', 'description')}, 'status updated');
    }
    catch (e) {
      log.error({err: e}, 'Failed to update build status');
    }
  };

  // handle status updates for setup task
  var taskUpdater = function(context, status) {
    // ignore context, it'll always be SETUP_CONTEXT
    // and for self-updates, action will always be 'running'
    // and state is 'pending' beause "env" status isn't complete
    // until we're ready to run user steps
    status.action = 'running';
    status.state = 'pending';
    co(updateStatus(SETUP_CONTEXT, status));
  };
  for (let task of setupTasks) {
    task.on('update', taskUpdater);
  }

  // handle status updates for each task
  taskUpdater = function(context, status) {
    co(updateStatus(context, status));
  };
  for (let task of userTasks) {
    task.on('update', taskUpdater);
  }


  emitBuildEvent(build, 'started', {}, {log, producer: self.buildsEventProducer});

  // continue processing the build in the background and firing off events
  setImmediate(function() {
    co(function* () {
      // RUN INITIALIZATION STEPS
      try {
        yield* updateStatus(SETUP_CONTEXT, {state: 'pending', action: 'running', description: `The hamsters are working hard on your setup`});
        // returns output of container.inspect
        let containerStatus = yield container.create();
        log.info({status: containerStatus}, 'Container ready');

        yield* updateStatus(SETUP_CONTEXT, {state: 'pending', action: 'running', description: 'Environment built'});
      }
      catch (e) {
        switch (e.statusCode) {
          // container conflict, reuse existing container
          case 409:
            log.warn(`Container ${containerName} is already exists, reusing it if not started`);

            var state = yield container.getState();
            if (state.Running) {
              // oh oh, there might be a problem
              log.error(`Container ${containerName} is already running, bailing`);
              yield* updateStatus(SETUP_CONTEXT, {state: 'error', action: 'finished', description: 'Build already in progress'});
              let err = new Error(`Build ${build.id} is already in progress`);
              err.status = 400;
              throw err;
            }

            yield container.start();

            yield* updateStatus(SETUP_CONTEXT, {state: 'pending', action: 'running', description: 'Reusing existing environment'});
            break;

          default:
            log.error({err: e}, 'Unknown container error');
            yield* updateStatus(SETUP_CONTEXT, {state: 'error', action: 'finished', description: e.message});
            throw e;
        }
      }

      var setupSuccessful = true;

      // container has been created, run initialization tasks
      try {
        log.info('Running setup tasks');
        yield* runTasks(setupTasks, {log: log, container: container, loom: self.loom, setup: true});
        yield* updateStatus(SETUP_CONTEXT, {state: 'success', action: 'finished', description: 'Environment ready'});
      }
      catch (e) {
        log.error({err: e}, 'Setup tasks failed: ' + e.message);
        yield* updateStatus(SETUP_CONTEXT, {state: 'error', action: 'finished', description: 'Environment build failed: ' + e.message});

        // bail on running the rest of the tasks
        setupSuccessful = false;
      }

      // RUN ALL USER TASKS
      if (setupSuccessful) {
        log.info('Running user tasks');
        yield* runTasks(userTasks, {log: log, container: container, loom: self.loom});
      }

      try {
        build.active = false;

        // save the container information for the build
        build.container = {
          id: container.container.id,
          name: containerName,
        };

        yield self.updateBuildContainerStatus(build);

        yield self.storeBuildDataAsync(build);

        emitBuildEvent(build, 'ready', {}, {log, producer: self.buildsEventProducer});
      }
      catch (error) {
        log.error({err: error}, 'Failed to write build to the BD');
      }
    });
  }, 0);

  // return a response to the requestor
  return {
    status: 'build started',
    container: {
      id: container.container.id || null,
      name: containerName,
    },
    build: {
      id: build.id,
    },
    steps: userTasks.length,
  };
};

Server.prototype.routes.get.containers = function(req, res, next) {
  var docker = new Docker(this.config.docker);
  var self = this;

  docker.listContainers({all: true, size: false}, function(err, containers) {
    if (err) return next(err);

    function proboFilter(containerInfo) {
      // .Names is an array, and first name in array is the main name
      // container names in docker start with a /, so look for our prefix
      // starting with second character (index 1)
      return containerInfo.Names[0].indexOf(self.config.containerNamePrefix) === 1;
    }

    function toInstances(containerInfo) {
      // return our Container instances
      return new Container({
        docker: self.config.docker,
        containerId: containerInfo.Id,
        log: self.log,
      });
    }

    containers = containers.filter(proboFilter).map(toInstances);

    co(function*() {
      var inspects = containers.map(function(c) { return c.inspect(); });
      // Inspect all containers in parallel.
      var infos = yield inspects;
      infos = infos.map(function(info) {
        return {
          id: info.Id,
          // get rid of initial '/' character
          name: info.Name.substr(1),
          state: info.State,
          ports: info.NetworkSettings.Ports,
        };
      });

      function stateReducer(running) {
        return function(count, info) {
          var state = info.state;
          if (running) {
            return state.Running ? count + 1 : count;
          }
          else {
            return state.Running ? count : count + 1;
          }
        };
      }

      res.json({
        capacity: self.config.containerCapacity || -1,
        running: infos.reduce(stateReducer(true), 0),
        stopped: infos.reduce(stateReducer(false), 0),
        containers: infos,
      });
      next();
    }, {req, res, next});
  });
};

/**
 * Delete the docker container from the server. THIS OPERATION CANNOT BE REVERSED!
 * By default, will not remove running containers.
 * Call with ?force=true delete running containers too.
 * @param {object} req - Restify request object.
 * @param {object} res - Restify response object.
 * @param {Function} next - The next middleware to call.
 */
Server.prototype.routes.del['containers/:id'] = function(req, res, next) {
  var self = this;

  // delete/remove the container and update the build entry in the DB
  var container = new Container({
    docker: this.config.docker,
    containerId: req.params.id,
    log: this.log,
  });
  logContainerEvents(container);

  function handleError(err, msg) {
    msg = msg ? msg + ': ' : '';
    var message = msg + (err.json || err.message);
    var code = err.statusCode || 500;
    res.send(code, {error: message.trim(), code: code});
    next();
  }

  container.inspect(function(err, info) {
    if (err) {
      return handleError(err);
    }

    // name is: probo--[repo slug]--[project id]--[buildid]
    var buildId = info.Name.split('--')[3];

    if (!buildId) {
      err = new Error(`BuildId not found for container name ${info.Name}`);
      err.statusCode = 400;
      return handleError(err);
    }

    // find matching build object
    self.getBuildData(buildId, function(err, build) {
      if (err) {
        self.log.error({err}, `Could not find build for buildId ${buildId}`);
        return handleError(err, `Could not find build for buildId ${buildId}`);
      }

      // set the build on the container so that it's available to container event listeners
      container.build = build;

      container.remove({force: req.query.force, v: req.query.v}, function(err, data) {
        if (err) {
          return handleError(err);
        }
        self.log.info({build}, 'Got build object to update');

        self.updateBuildContainerStatus(build, function(err, build) {
          if (err) {
            self.log.error({err, container: build.container}, `Could not update container status for build ${buildId}, continuing`);
          }

          self.log.info({container: build.container}, 'Update build container info');

          // set the reaped flag to true to help upstream event processors have more context
          build.reaped = true;

          self.storeBuildData(build, function(err) {
            emitBuildEvent(build, 'reaped', {}, {log: self.log, producer: self.buildsEventProducer});

            res.json({status: 'removed', id: info.Id});
            return next();
          });
        });
      });
    });
  });
};


/**
 * Get information about an active container for a build.
 * Start container if it's not running
 * POST /container/proxy?build=:buildId
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 * @param {function} next - The next middleware to call.
 * @return {undefined}
 */
Server.prototype.routes.post['container/proxy'] = function(req, res, next) {
  var self = this;

  var buildId = req.query.build;
  if (!buildId) {
    return next(new restify.InvalidContentError('build query param required'));
  }

  co(function* () {
    // find build object for our build id
    var build;
    try {
      build = yield self.getFromDBAsync('builds', buildId);
    }
    catch (err) {
      if (err.notFound) {
        return next(new restify.ResourceNotFoundError('Build not found for build id: ' + buildId));
      }
    }

    // lookup container object for the build
    if (!build.container) {
      return next(new restify.ResourceNotFoundError('Build is still in progress'));
    }

    var log = req.log.child({buildId: build.id});

    var container = new Container({
      docker: self.config.docker,
      containerId: build.container.id,
      build: build,
      log: log,
    });
    logContainerEvents(container);

    // hook up event listeners to the container so build record is kept in sync
    container.on('stateChange', function updateBuild(event, err, data) {
      if (['started', 'stopped'].indexOf(event) >= 0) {
        co(function* () {
          try {
            yield self.updateBuildContainerStatus(build);
            yield self.storeBuildDataAsync(build);
          }
          catch (e) {
            log.error({err: e, event: event, build: {id: build.id}},
                      'Failed to update container status for build');
          }
        });
      }
    });

    try {
      var state = yield container.getState();
      var setIdleTimeout = false;
      if (!state.Running) {
        log.info({buildId: build.id, containerId: container.containerId}, 'Waking up container');
        yield container.start();
        setIdleTimeout = true;
      }

      self.resetContainerIdleTimeout(container, setIdleTimeout, log);

      // find port 80 mapping for this container
      var targetPort = 80;
      var inspectInfo = yield container.inspect();
      var exposedHostPort = container.getExposedPortFromContainerInfo(inspectInfo, targetPort);


      // wait for the port to be up before responding if it's not up yet
      var up = true;
      var duration;
      var start;
      try {
        start = new Date().getTime();
        var portOpts = {numRetries: 10, retryInterval: 500, debug: log.debug.bind(log)};
        yield waitForPort('localhost', exposedHostPort, portOpts);
        log.debug(`Container port ${targetPort}/${exposedHostPort} up`);

        // wait for containerStartupPause if specified when container starts
        // temp until we have a better solution
        // defaults to 0 (no wait), looks at probo config startupPause, CM config proxyStartupPause
        // in that order
        if (setIdleTimeout) {
          let startupPause = +ms(build.config.startupPause || self.config.proxyStartupPause || '0');
          if (startupPause) {
            log.debug(`Container starting, pausing for ${ms(startupPause)}`);
          }
          yield wait(startupPause);
        }

      }
      catch (e) {
        up = false;
        duration = (new Date().getTime()) - start;
        log.warn(`Service connection timed out (${e}) on container port ${targetPort}/${exposedHostPort} after ${duration}ms. Continuing with proxy response anyway.`);
      }

      duration = (new Date().getTime()) - start;


      // respond with port, host, and build job config
      var urlParts = url.parse('http://' + req.header('host'));
      log.debug({urlParts}, 'parsed HOST header');
      // If host is set, port isn't used in .format().
      delete urlParts.host;
      urlParts.port = exposedHostPort;

      res.json({
        proxy: {
          host: urlParts.hostname,
          port: urlParts.port,
          url: url.format(urlParts),
        },
        buildConfig: build.config,
        status: {
          up: up,
          info: up ? 'ok' : `Timed out after ${duration}ms`,
          ts: new Date(),
        },
      });
      return next();
    }
    catch (e) {
      // problems interacting with the container
      log.error({err: e}, 'Problem starting or starting container');
      return next(new restify.ResourceNotFoundError('Could not get container, error: ' + e.message));
    }
  }, {req, res, next});
};

/**
 * List builds on this server that have a matching existing container (by default).
 * Use ?all=true query param to get all build records.
 * NOTE: does NOT do a live check for an existing container. Relies on meta-data that's in the build.container object.
 * @param {object} req - Restify request object.
 * @param {object} res - Restify response object.
 * @param {Function} next - The next middleware to call.
 */
Server.prototype.routes.get.builds = function(req, res, next) {
  var readStream = this.streamFromDB('builds');
  var jsonStream = new JSONStream.stringify();
  var buildsStream = readStream;

  if (req.query.all !== 'true') {
    // filter out builds that don't have an existing container by default
    buildsStream = buildsStream.pipe(through2.obj(function(build, enc, callback) {
      if (build.container && build.container.state !== 'deleted') {
        callback(null, build);
      }
      else {
        callback();
      }
    }));
  }

  buildsStream.pipe(jsonStream).pipe(res);
  res.on('finish', next);
};

/**
 * Update the container status for all builds. Intended as a one-time catchup/migration
 * to add metadata set by updateBuildContainerStatus()
 * @param {object} req - Restify request object.
 * @param {object} res - Restify response object.
 * @param {Function} next - The next middleware to call.
 */
Server.prototype.routes.post['sync/builds'] = function(req, res, next) {
  var self = this;
  this.streamFromDB('builds').pipe(through2.obj(function(build, enc, callback) {
    if (!build.container) {
      var msg = `Skipping build ${build.id} because it does not have container info`;
      self.log.warn(msg);
      res.write(msg + '\n');
      return callback();
    }

    self.updateBuildContainerStatus(build, function(err, _build) {
      self.log.info(`Updating container state for build ${build.id}...`);

      var msg;
      if (err) {
        msg = 'Failed to update container state for build ' + build.id;
        self.log.error({err, build}, msg);
        res.write(msg + '\n');
        callback(err);
      }
      else {
        self.storeBuildData(build, function(err) {
          msg = `Container state updated for build ${build.id}`;
          self.log.info(msg);
          res.write(msg + '\n');
          callback(err);
        });
      }
    });
  })).on('finish', res.end.bind(res));
  res.on('finish', next);
};

Server.prototype.routes.get['builds/:id'] = function(req, res) {
  this.getFromDB('builds', req.params.id, function(error, data) {
    if (error) {
      return res.send(404, error);
    }
    res.send(data);
  });
};

/**
 * Trigger a re-build of an existing build. No body required, just the build id
 *
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 * @param {function} next - The next middleware to call.
 */
Server.prototype.routes.post['builds/:id'] = function(req, res, next) {
  var self = this;
  req.buildId = req.params.id;

  this.getFromDB('builds', req.params.id, function(error, build) {
    if (error) {
      return res.send(404, error);
    }

    // clear a few build-related things
    delete build.container;
    delete build.active;

    co(function* () {
      try {
        var result = yield self.runBuild(build, req.log);
        res.json(result);
      }
      catch (innerError) {
        var status = innerError.status || 500;
        res.json(status, {error: innerError.message});
        req.log.error({err: innerError});
      }
      return next();
    }, {req, res, next});
  });
};

/**
 * Delete an individual build from the DB
 * @param {object} req - Restify request object.
 * @param {object} res - Restify response object.
 * @param {Function} next - The next middleware to call.
 */
Server.prototype.routes.del['builds/:id'] = function(req, res, next) {
  this.log.info('deleting build ' + req.params.id);
  this.delFromDB('builds', req.params.id, function(error) {
    if (error) return res.send(500, error);
    res.send('success');
    next();
  });
};


Server.prototype.resetContainerIdleTimeout = function(container, set, log) {
  var idleTimeout = this.config.containerIdleTimeout || '10m';
  var containerId = container.containerId;

  var to = this.containerIdleTimeouts[containerId];
  if (set || to) {
    // reset timeout if it's already existing, or 'set' flag is set to true (we just started container)

    clearTimeout(to);
    log.info({id: containerId}, `Resetting container idle timeout to ${ms(ms(idleTimeout))}`);

    // stop container after the timeout
    this.containerIdleTimeouts[containerId] = setTimeout(function() {
      log.info({id: containerId}, 'Stopping container');
      container.stop();
    }, ms(idleTimeout));
  }
};

/**
 * Sets .container properties on the build with the status of the container. Values are:
 * state:
 *  "deleted" - if the docker container does not exist for the build
 *  "stopped" - if the docker container exists and is stopped
 *  "running" - if the docker container exists and is running
 * diskSpace:
 *  .virtualBytes - size of the container's flattened images in bytes, if container exists, null otherwise
 *  .realBytes - size of the container's own RW layer in bytes, if container exists, null otherwise
 */
Server.prototype.updateBuildContainerStatus = Promise.promisify(function(build, done) {
  var self = this;
  var container = new Container({
    docker: this.config.docker,
    containerId: build.container.id,
    build: build,
    log: this.log,
  });

  function getState(cb) {
    container.getState(function(err, state) {
      if (err) {
        // 404 if container doesn't exist
        if (err.statusCode === 404) {
          return cb(null, 'deleted');
        }
        else {
          return cb(err);
        }
      }

      cb(null, state.Running ? 'running' : 'stopped');
    });
  }

  function getDiskUsage(cb) {
    container.getDiskUsage(function(err, usage) {
      if (err) {
        // log the error, but don't stop
        self.log.error({err}, `Can't get disk usage for container ${container.containerId}, continuing`);
      }

      cb(null, usage);
    });
  }

  async.parallel({
    diskSpace: getDiskUsage,
    state: getState,
  }, function(err, results) {
    if (err) {
      return done(err);
    }

    build.container.state = results.state;

    // don't update disks usage if container has been deleted for posterity
    if (results.state !== 'deleted') {
      build.diskSpace = results.diskSpace;
    }

    done(null, build);
  });
});

/**
 * Get a build object by buildId.
 * @param {object} buildId - Id of build to retreive
 * @param {Function} done - Callback: function(err, build)
 * @return {Promise} - The promise which will resolve wiht the build data.
 */
Server.prototype.getBuildData = function(buildId, done) {
  return this.getFromDB('builds', buildId, done);
};

Server.prototype.storeBuildData = function(data, done) {
  data.updatedAt = new Date().toJSON();
  return this.storeInDB('builds', data, done);
};


Server.prototype.storeInDB = function(key, data, done) {
  if (!data.id) {
    data.id = format(this.flakeIdGen.next(), 'hex');
  }
  this.db.put(key + '!' + data.id, data, function(error) {
    done(error, data);
  });
};

Server.prototype.delFromDB = function(key, id, done) {
  this.db.del(key + '!' + id, done);
};

Server.prototype.getFromDB = function(key, id, done) {
  this.db.get(key + '!' + id, {valueEncoding: 'json'}, done);
};

/**
 * Stream data from the db with keys prefixed with 'key'. Data is streamed as JSON objects
 *
 * @param {string} key - The prefix to stream data from.
 * @return {stream} - A read stream of database results.
 */
Server.prototype.streamFromDB = function(key) {
  var readStream = this.db.createValueStream({
    gte: key + '!!',
    lte: key + '!~',
    valueEncoding: 'json',
  });
  return readStream;
};

Promise.promisifyAll(Server.prototype);

module.exports = Server;
