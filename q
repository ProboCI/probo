[1mdiff --git a/cli-subcommands/container-manager.js b/cli-subcommands/container-manager.js[m
[1mindex e5bc4f3..eb52125 100644[m
[1m--- a/cli-subcommands/container-manager.js[m
[1m+++ b/cli-subcommands/container-manager.js[m
[36m@@ -7,7 +7,7 @@[m [mvar exports = function() {[m
   this.run = this.run.bind(this);[m
 };[m
 [m
[31m-exports.shortDescription = 'Provides the mongo backed REST API server that manages creating and tracking containers.';[m
[32m+[m[32mexports.shortDescription = 'Provides the REST API server that manages the lifecycle of environment containers.';[m
 [m
 exports.help = 'Runs the API server for creating docker containers.';[m
 [m
[36m@@ -20,16 +20,16 @@[m [mexports.options = function(yargs) {[m
   ;[m
 };[m
 [m
[31m-exports.run = function(amour) {[m
[31m-  var Server = amour.ContainerManager;[m
[32m+[m[32mexports.run = function(probo) {[m
[32m+[m[32m  var Server = probo.ContainerManager;[m
   var server = new Server();[m
[31m-  var config = amour.config;[m
[32m+[m[32m  var config = probo.config;[m
   process.title = 'probo-cm';[m
   server.configure(config, function(error) {[m
     if (error) throw error;[m
[31m-    server.run(amour, function(error) {[m
[32m+[m[32m    server.run(probo, function(error) {[m
       logger.getLogger('container-manager')[m
[31m-        .info({config}, `Listening on ${config.port}`);[m
[32m+[m[32m        .debug({config}, `Listening on ${config.port}`);[m
     });[m
   });[m
 };[m
[1mdiff --git a/lib/ContainerManager.js b/lib/ContainerManager.js[m
[1mindex 33cbddd..bb9254f 100644[m
[1m--- a/lib/ContainerManager.js[m
[1m+++ b/lib/ContainerManager.js[m
[36m@@ -30,118 +30,348 @@[m [mvar logContainerEvents = function(container) {[m
   });[m
 };[m
 [m
[31m-/**[m
[31m- * The container manager object that contains all routes.[m
[31m- */[m
[31m-var Server = function() {[m
[31m-  this.configure = this.configure.bind(this);[m
[31m-  this.run = this.run.bind(this);[m
[31m-  for (let verb in this.routes) {[m
[31m-    if (this.routes.hasOwnProperty(verb)) {[m
[31m-      for (let route in this.routes[verb]) {[m
[31m-        if (this.routes[verb].hasOwnProperty(route)) {[m
[31m-          this.routes[verb][route] = this.routes[verb][route].bind(this);[m
[32m+[m[32mclass Server {[m
[32m+[m
[32m+[m[32m  /**[m
[32m+[m[32m   * The container manager object that contains all routes.[m
[32m+[m[32m   */[m
[32m+[m[32m  constructor() {[m
[32m+[m[32m    this.configure = this.configure.bind(this);[m
[32m+[m[32m    this.run = this.run.bind(this);[m
[32m+[m[32m    for (let verb in this.routes) {[m
[32m+[m[32m      if (this.routes.hasOwnProperty(verb)) {[m
[32m+[m[32m        for (let route in this.routes[verb]) {[m
[32m+[m[32m          if (this.routes[verb].hasOwnProperty(route)) {[m
[32m+[m[32m            this.routes[verb][route] = this.routes[verb][route].bind(this);[m
[32m+[m[32m          }[m
         }[m
       }[m
     }[m
[31m-  }[m
 [m
[31m-  this.containerIdleTimeouts = {};[m
[31m-};[m
[32m+[m[32m    this.containerIdleTimeouts = {};[m
[32m+[m[32m  }[m
 [m
[31m-Server.prototype.run = function(probo, done) {[m
[31m-  var self = this;[m
[31m-  this.server.listen(probo.config.port, function(error) {[m
[31m-    self.log.info('server started and listening on ' + self.server.url);[m
[31m-    done(error);[m
[31m-  });[m
[31m-};[m
[32m+[m[32m  run(probo, done) {[m
[32m+[m[32m    var self = this;[m
[32m+[m[32m    this.server.listen(probo.config.port, function(error) {[m
[32m+[m[32m      self.log.info('server started and listening on ' + self.server.url);[m
[32m+[m[32m      done(error);[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
 [m
 [m
[31m-Server.prototype.configure = function(config, done) {[m
[31m-  var self = this;[m
[31m-  this.config = config;[m
[31m-  // TODO: We should probably be injecting this logger.[m
[31m-  this.log = logger.getLogger('container-manager');[m
[32m+[m[32m  configure(config, done) {[m
[32m+[m[32m    var self = this;[m
[32m+[m[32m    this.config = config;[m
[32m+[m[32m    // TODO: We should probably be injecting this logger.[m
[32m+[m[32m    this.log = logger.getLogger('container-manager');[m
 [m
[31m-  var API = require('./api');[m
[32m+[m[32m    var API = require('./api');[m
 [m
[31m-  this.api = API.getAPI({[m
[31m-    url: this.config.api.url,[m
[31m-    token: this.config.api.token,[m
[31m-    buildUrl: this.config.buildUrl,[m
[31m-    log: this.log,[m
[31m-  });[m
[32m+[m[32m    this.api = API.getAPI({[m
[32m+[m[32m      url: this.config.api.url,[m
[32m+[m[32m      token: this.config.api.token,[m
[32m+[m[32m      buildUrl: this.config.buildUrl,[m
[32m+[m[32m      log: this.log,[m
[32m+[m[32m    });[m
 [m
[31m-  var server = restify.createServer({[m
[31m-    name: config.name,[m
[31m-    version: require('../package').version,[m
[31m-    log: this.log.child({component: 'http'}),[m
[31m-  });[m
[31m-  server.use(restify.acceptParser(server.acceptable));[m
[31m-  server.use(restify.bodyParser({mapParams: false}));[m
[31m-  server.use(restify.queryParser({mapParams: false}));[m
[32m+[m[32m    var server = restify.createServer({[m
[32m+[m[32m      name: config.name,[m
[32m+[m[32m      version: require('../package').version,[m
[32m+[m[32m      log: this.log.child({component: 'http'}),[m
[32m+[m[32m    });[m
[32m+[m[32m    server.use(restify.acceptParser(server.acceptable));[m
[32m+[m[32m    server.use(restify.bodyParser({mapParams: false}));[m
[32m+[m[32m    server.use(restify.queryParser({mapParams: false}));[m
 [m
[31m-  // Extend logger using the plugin.[m
[31m-  server.use(restify.requestLogger({[m
[31m-    serializers: restify.bunyan.serializers,[m
[31m-  }));[m
[32m+[m[32m    // Extend logger using the plugin.[m
[32m+[m[32m    server.use(restify.requestLogger({[m
[32m+[m[32m      serializers: restify.bunyan.serializers,[m
[32m+[m[32m    }));[m
 [m
[31m-  server.use(function(req, res, next) {[m
[31m-    req.log.info({req: req}, 'REQUEST');[m
[31m-    next();[m
[31m-  });[m
[32m+[m[32m    server.use(function(req, res, next) {[m
[32m+[m[32m      req.log.info({req: req}, 'REQUEST');[m
[32m+[m[32m      next();[m
[32m+[m[32m    });[m
 [m
[31m-  server.on('after', restify.auditLogger({[m
[31m-    log: server.log,[m
[31m-  }));[m
[32m+[m[32m    server.on('after', restify.auditLogger({[m
[32m+[m[32m      log: server.log,[m
[32m+[m[32m    }));[m
 [m
[31m-  server.on('uncaughtException', function(req, res, route, err) {[m
[31m-    console.log('uncaughtException', err.stack);[m
[31m-    req.log.error({err: err}, 'uncaughtException');[m
[31m-    // err._customContent = 'something is wrong!';[m
[31m-  });[m
[32m+[m[32m    server.on('uncaughtException', function(req, res, route, err) {[m
[32m+[m[32m      console.log('uncaughtException', err.stack);[m
[32m+[m[32m      req.log.error({err: err}, 'uncaughtException');[m
[32m+[m[32m      // err._customContent = 'something is wrong!';[m
[32m+[m[32m    });[m
 [m
[31m-  for (let verb in this.routes) {[m
[31m-    if (this.routes.hasOwnProperty(verb)) {[m
[31m-      for (let route in this.routes[verb]) {[m
[31m-        if (this.routes[verb].hasOwnProperty(route)) {[m
[31m-          server[verb](config.prefix + '/' + route, this.routes[verb][route]);[m
[32m+[m[32m    for (let verb in this.routes) {[m
[32m+[m[32m      if (this.routes.hasOwnProperty(verb)) {[m
[32m+[m[32m        for (let route in this.routes[verb]) {[m
[32m+[m[32m          if (this.routes[verb].hasOwnProperty(route)) {[m
[32m+[m[32m            server[verb](config.prefix + '/' + route, this.routes[verb][route]);[m
[32m+[m[32m          }[m
         }[m
       }[m
     }[m
[31m-  }[m
 [m
[31m-  this.server = server;[m
[31m-  // Allow the db to be handed in with the config.[m
[31m-  this.db = config.levelupDB || level(config.dataDir, {valueEncoding: 'json'});[m
[32m+[m[32m    this.server = server;[m
[32m+[m[32m    // Allow the db to be handed in with the config.[m
[32m+[m[32m    this.db = config.levelupDB || level(config.dataDir, {valueEncoding: 'json'});[m
 [m
[31m-  this.loom = loom(config.loom, this.log);[m
[32m+[m[32m    this.loom = loom(config.loom, this.log);[m
 [m
[31m-  // update safeco's error handler with bunyan logging one[m
[31m-  co = co(function(err, opts) {[m
[31m-    (opts.req || self).log.error({err: err}, 'Uncaught co Exception');[m
[32m+[m[32m    // update safeco's error handler with bunyan logging one[m
[32m+[m[32m    co = co(function(err, opts) {[m
[32m+[m[32m      (opts.req || self).log.error({err: err}, 'Uncaught co Exception');[m
 [m
[31m-    if (opts.res) {[m
[31m-      try {[m
[31m-        opts.res.send(err);[m
[32m+[m[32m      if (opts.res) {[m
[32m+[m[32m        try {[m
[32m+[m[32m          opts.res.send(err);[m
[32m+[m[32m        }[m
[32m+[m[32m        catch (e) {[m
[32m+[m[32m          // headers already sent, reponse started[m
[32m+[m[32m         // write error to the response and end it[m
[32m+[m[32m          var reqIdStr = opts.req ? `(req id ${opts.req.id()})` : '';[m
[32m+[m[32m          opts.res.end(`\n\nERROR: ${err.message}, terminating response ${reqIdStr}`);[m
[32m+[m[32m        }[m
       }[m
[31m-      catch (e) {[m
[31m-        // headers already sent, reponse started[m
[31m-       // write error to the response and end it[m
[31m-        var reqIdStr = opts.req ? `(req id ${opts.req.id()})` : '';[m
[31m-        opts.res.end(`\n\nERROR: ${err.message}, terminating response ${reqIdStr}`);[m
[32m+[m
[32m+[m[32m      // let middleware continue[m
[32m+[m[32m      if (opts.next) {[m
[32m+[m[32m        opts.next();[m
       }[m
[32m+[m[32m    });[m
[32m+[m
[32m+[m[32m    done();[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  handleError(req, res, error) {[m
[32m+[m[32m    var status = error.status || 500;[m
[32m+[m[32m    res.json(status, {error: error.message});[m
[32m+[m[32m    req.log.error({err: error});[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  /**[m
[32m+[m[32m   * Get a build object by buildId.[m
[32m+[m[32m   * @param {object} buildId - Id of build to retreive[m
[32m+[m[32m   * @param {Function} done - Callback: function(err, build)[m
[32m+[m[32m   * @return {Promise} - The promise which will resolve wiht the build data.[m
[32m+[m[32m   */[m
[32m+[m[32m  getBuildData(buildId, done) {[m
[32m+[m[32m    return this.getFromDB('builds', buildId, done);[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  storeBuildData(data, done) {[m
[32m+[m[32m    data.updatedAt = new Date().toJSON();[m
[32m+[m[32m    return this.storeInDB('builds', data, done);[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m
[32m+[m[32m  storeInDB(key, data, done) {[m
[32m+[m[32m    // TODO: Move StoreInDB to the build class.[m
[32m+[m[32m    this.db.put(key + '!' + data.id, data, function(error) {[m
[32m+[m[32m      done(error, data);[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  delFromDB(key, id, done) {[m
[32m+[m[32m    this.db.del(key + '!' + id, done);[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  getFromDB(key, id, done) {[m
[32m+[m[32m    this.db.get(key + '!' + id, {valueEncoding: 'json'}, done);[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  /**[m
[32m+[m[32m   * Stream data from the db with keys prefixed with 'key'. Data is streamed as JSON objects[m
[32m+[m[32m   *[m
[32m+[m[32m   * @param {string} key - The prefix to stream data from.[m
[32m+[m[32m   * @return {stream} - A read stream of database results.[m
[32m+[m[32m   */[m
[32m+[m[32m  streamFromDB(key) {[m
[32m+[m[32m    var readStream = this.db.createValueStream({[m
[32m+[m[32m      gte: key + '!!',[m
[32m+[m[32m      lte: key + '!~',[m
[32m+[m[32m      valueEncoding: 'json',[m
[32m+[m[32m    });[m
[32m+[m[32m    return readStream;[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  constructBuild(buildConfig, log) {[m
[32m+[m[32m    log = log.child({bid: buildConfig.id}, true);[m
[32m+[m[32m    var containerConfig = this.createContainerConfig(buildConfig, log);[m
[32m+[m[32m    containerConfig.log = log;[m
[32m+[m[32m    var container = new Container(containerConfig);[m
[32m+[m[32m    var build = new Build();[m
[32m+[m[32m    // TODO: make this auto-reference fancier?[m
[32m+[m[32m    container.build = build;[m
[32m+[m[32m    build.container = container;[m
[32m+[m[32m    var stepList = new StepList(container);[m
[32m+[m[32m    build.step = stepList;[m
[32m+[m[32m    var shellOptions = {[m
[32m+[m[32m      name: 'Shell Test',[m
[32m+[m[32m      command: 'mkdir /var/www/html && echo "<h1>Hello world.</h1>" > /var/www/html/index.html && chmod 777 -R /var/www/html',[m
[32m+[m[32m    };[m
[32m+[m[32m    stepList.addStep(new Shell(container, shellOptions));[m
[32m+[m[32m    return build;[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  runBuild(buildConfig, log, done) {[m
[32m+[m[32m    var self = this;[m
[32m+[m
[32m+[m[32m    var build = this.constructBuild(buildConfig, log);[m
[32m+[m
[32m+[m[32m    var project = buildConfig.project;[m
[32m+[m
[32m+[m[32m    var containerName = `${self.config.containerNamePrefix}--${project.slug.replace('/', '.')}--${project.id}--${buildConfig.id}`;[m
[32m+[m[32m    buildConfig.containerName = containerName;[m
[32m+[m
[32m+[m[32m    log.info(`Starting container: ${containerName}`);[m
[32m+[m
[32m+[m[32m      // TODO: Move construction of build into its own method or even helper class.[m
[32m+[m
[32m+[m[32m    build.container.create(function(error, data) {[m
[32m+[m[32m      // TODO: Refactor codeDownloader into a class that switches for the type (or something).[m
[32m+[m[32m      if (error) return done(error);[m
[32m+[m[32m      build.run(function(error, data) {[m
[32m+[m[32m        if (error) return done(error);[m
[32m+[m[32m        var returnData = {[m
[32m+[m[32m          status: 'build started',[m
[32m+[m[32m          container: {[m
[32m+[m[32m            id: build.container.id || null,[m
[32m+[m[32m            name: containerName,[m
[32m+[m[32m          },[m
[32m+[m[32m          build: {[m
[32m+[m[32m            id: build.id,[m
[32m+[m[32m          },[m
[32m+[m[32m          steps: build.step.steps.length,[m
[32m+[m[32m        };[m
[32m+[m[32m        done(null, returnData);[m
[32m+[m[32m      });[m
[32m+[m[32m    });[m
[32m+[m
[32m+[m[32m    /*[m
[32m+[m[32m    return {[m
[32m+[m[32m      status: 'build started',[m
[32m+[m[32m      container: {[m
[32m+[m[32m        id: container.container.id || null,[m
[32m+[m[32m        name: containerName,[m
[32m+[m[32m      },[m
[32m+[m[32m      build: {[m
[32m+[m[32m        id: build.id,[m
[32m+[m[32m      },[m
[32m+[m[32m      steps: userTasks.length,[m
[32m+[m[32m    };[m
[32m+[m[32m    */[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  createContainerConfig(build) {[m
[32m+[m[32m    var image = build.config.image || this.config.defaultImage;[m
[32m+[m[32m    return {[m
[32m+[m[32m      // Configuration specific to this build.[m
[32m+[m[32m      dockerConnectionInfo: this.config.docker,[m
[32m+[m[32m      build: build,[m
[32m+[m[32m      jobConfig: build.config,[m
[32m+[m[32m      containerName: build.containerName,[m
[32m+[m[32m      containerId: build.containerName,[m
[32m+[m[32m      image: image,[m
[32m+[m[32m      imageConfig: this.config.images[image],[m
[32m+[m
[32m+[m[32m      // Global configuration for what binds to expose to all containers.[m
[32m+[m[32m      binds: this.config.binds,[m
[32m+[m[32m      // attachLogs: true, // set to true to attach 'docker -f logs' to stdout of this process[m
[32m+[m
[32m+[m[32m      // TODO: Can we have a more generic way of passing plugin config through[m
[32m+[m[32m      // without explicit knowledge of plugin configuration here?[m
[32m+[m[32m      assets: this.config.assets,[m
[32m+[m
[32m+[m[32m      // auth credentials service (i.e., for stash)[m
[32m+[m[32m      authUrl: this.config.auth.url,[m
[32m+[m[32m    };[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  resetContainerIdleTimeout(container, set, log) {[m
[32m+[m[32m    var idleTimeout = this.config.containerIdleTimeout || '10m';[m
[32m+[m[32m    var containerId = container.containerId;[m
[32m+[m
[32m+[m[32m    var to = this.containerIdleTimeouts[containerId];[m
[32m+[m[32m    if (set || to) {[m
[32m+[m[32m      // reset timeout if it's already existing, or 'set' flag is set to true (we just started container)[m
[32m+[m
[32m+[m[32m      clearTimeout(to);[m
[32m+[m[32m      log.info({id: containerId}, `Resetting container idle timeout to ${ms(ms(idleTimeout))}`);[m
[32m+[m
[32m+[m[32m      // stop container after the timeout[m
[32m+[m[32m      this.containerIdleTimeouts[containerId] = setTimeout(function() {[m
[32m+[m[32m        log.info({id: containerId}, 'Stopping container');[m
[32m+[m[32m        container.stop();[m
[32m+[m[32m      }, ms(idleTimeout));[m
     }[m
[32m+[m[32m  }[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Sets .container properties on the build with the status of the container. Values are:[m
[32m+[m[32m * state:[m
[32m+[m[32m *  "deleted" - if the docker container does not exist for the build[m
[32m+[m[32m *  "stopped" - if the docker container exists and is stopped[m
[32m+[m[32m *  "running" - if the docker container exists and is running[m
[32m+[m[32m * // TODO: Consider renaming these actualSize and virtualSize, I would have guessed wrong about this.[m
[32m+[m[32m * disk:[m
[32m+[m[32m *  .imageSize - size of the container's image in bytes, if container exists, null otherwise[m
[32m+[m[32m *  .containerSize - size of the container's ownlayer in bytes, if container exists, null otherwise[m
[32m+[m[32m * TODO: de-promisify this.[m
[32m+[m[32m */[m
[32m+[m[32mServer.prototype.updateBuildContainerStatus = Promise.promisify(function(build, done) {[m
[32m+[m[32m  var self = this;[m
[32m+[m[32m  var container = new Container({[m
[32m+[m[32m    docker: this.config.docker,[m
[32m+[m[32m    containerId: build.container.id,[m
[32m+[m[32m    log: this.log,[m
[32m+[m[32m  });[m
[32m+[m
[32m+[m[32m  function getState(cb) {[m
[32m+[m[32m    container.getState(function(err, state) {[m
[32m+[m[32m      if (err) {[m
[32m+[m[32m        // 404 if container doesn't exist[m
[32m+[m[32m        if (err.statusCode === 404) {[m
[32m+[m[32m          return cb(null, 'deleted');[m
[32m+[m[32m        }[m
[32m+[m[32m        else {[m
[32m+[m[32m          return cb(err);[m
[32m+[m[32m        }[m
[32m+[m[32m      }[m
[32m+[m
[32m+[m[32m      cb(null, state.Running ? 'running' : 'stopped');[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
 [m
[31m-    // let middleware continue[m
[31m-    if (opts.next) {[m
[31m-      opts.next();[m
[32m+[m[32m  function getDiskUsage(cb) {[m
[32m+[m[32m    container.getDiskUsage(function(err, usage) {[m
[32m+[m[32m      if (err) {[m
[32m+[m[32m        // log the error, but don't stop[m
[32m+[m[32m        self.log.error({err}, `Can't get disk usage for container ${container.containerId}, continuing`);[m
[32m+[m[32m      }[m
[32m+[m
[32m+[m[32m      cb(null, usage);[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  async.parallel({[m
[32m+[m[32m    disk: getDiskUsage,[m
[32m+[m[32m    state: getState,[m
[32m+[m[32m  }, function(err, results) {[m
[32m+[m[32m    if (err) {[m
[32m+[m[32m      return done(err);[m
     }[m
[32m+[m
[32m+[m[32m    build.container.disk = results.disk;[m
[32m+[m[32m    build.container.state = results.state;[m
[32m+[m
[32m+[m[32m    done(null, build);[m
   });[m
[32m+[m[32m});[m
 [m
[31m-  done();[m
[31m-};[m
 [m
 /**[m
  * Define empty route structures so that it is easy to layer them on below.[m
[36m@@ -153,12 +383,6 @@[m [mServer.prototype.routes = {[m
   del: {},[m
 };[m
 [m
[31m-Server.prototype.handleError = function(req, res, error) {[m
[31m-  var status = error.status || 500;[m
[31m-  res.json(status, {error: error.message});[m
[31m-  req.log.error({err: error});[m
[31m-};[m
[31m-[m
 Server.prototype.routes.post['start-build'] = function(req, res, next) {[m
   var body = req.body;[m
   var build = body.build;[m
[36m@@ -185,102 +409,6 @@[m [mServer.prototype.routes.post['start-build'] = function(req, res, next) {[m
 // Provide a backward compatible alias to our old path.[m
 Server.prototype.routes.post.startbuild = Server.prototype.routes.post['start-build'];[m
 [m
[31m-Server.prototype.constructBuild = function(buildConfig, log) {[m
[31m-  log = log.child({bid: buildConfig.id}, true);[m
[31m-  var containerConfig = this.createContainerConfig(buildConfig, log);[m
[31m-  containerConfig.log = log;[m
[31m-  var container = new Container(containerConfig);[m
[31m-  var build = new Build();[m
[31m-  // TODO: make this auto-reference fancier?[m
[31m-  container.build = build;[m
[31m-  build.container = container;[m
[31m-  var stepList = new StepList(container);[m
[31m-  build.step = stepList;[m
[31m-  var shellOptions = {[m
[31m-    name: 'Shell Test',[m
[31m-    command: 'mkdir /var/www/html && echo "<h1>Hello world.</h1>" > /var/www/html/index.html && chmod 777 -R /var/www/html',[m
[31m-  };[m
[31m-  stepList.addStep(new Shell(container, shellOptions));[m
[31m-  return build;[m
[31m-};[m
[31m-[m
[31m-Server.prototype.prepareSteps = function(jobConfig) {[m
[31m-};[m
[31m-[m
[31m-Server.prototype.runBuild = function(buildConfig, log, done) {[m
[31m-  var self = this;[m
[31m-[m
[31m-  var build = this.constructBuild(buildConfig, log);[m
[31m-[m
[31m-  var project = buildConfig.project;[m
[31m-[m
[31m-  var containerName = `${self.config.containerNamePrefix}--${project.slug.replace('/', '.')}--${project.id}--${buildConfig.id}`;[m
[31m-  buildConfig.containerName = containerName;[m
[31m-[m
[31m-  log.info(`Starting container: ${containerName}`);[m
[31m-[m
[31m-    // TODO: Move construction of build into its own method or even helper class.[m
[31m-[m
[31m-  build.container.create(function(error, data) {[m
[31m-    // TODO: Refactor codeDownloader into a class that switches for the type (or something).[m
[31m-    if (error) return done(error);[m
[31m-    build.run(function(error, data) {[m
[31m-      if (error) return done(error);[m
[31m-      var returnData = {[m
[31m-        status: 'build started',[m
[31m-        container: {[m
[31m-          id: build.container.id || null,[m
[31m-          name: containerName,[m
[31m-        },[m
[31m-        build: {[m
[31m-          id: build.id,[m
[31m-        },[m
[31m-        steps: build.step.steps.length,[m
[31m-      };[m
[31m-      done(null, returnData);[m
[31m-    });[m
[31m-  });[m
[31m-[m
[31m-  /*[m
[31m-  return {[m
[31m-    status: 'build started',[m
[31m-    container: {[m
[31m-      id: container.container.id || null,[m
[31m-      name: containerName,[m
[31m-    },[m
[31m-    build: {[m
[31m-      id: build.id,[m
[31m-    },[m
[31m-    steps: userTasks.length,[m
[31m-  };[m
[31m-  */[m
[31m-};[m
[31m-[m
[31m-Server.prototype.createContainerConfig = function(build) {[m
[31m-  var image = build.config.image || this.config.defaultImage;[m
[31m-  return {[m
[31m-    // Configuration specific to this build.[m
[31m-    dockerConnectionInfo: this.config.docker,[m
[31m-    build: build,[m
[31m-    jobConfig: build.config,[m
[31m-    containerName: build.containerName,[m
[31m-    containerId: build.containerName,[m
[31m-    image: image,[m
[31m-    imageConfig: this.config.images[image],[m
[31m-[m
[31m-    // Global configuration for what binds to expose to all containers.[m
[31m-    binds: this.config.binds,[m
[31m-    // attachLogs: true, // set to true to attach 'docker -f logs' to stdout of this process[m
[31m-[m
[31m-    // TODO: Can we have a more generic way of passing plugin config through[m
[31m-    // without explicit knowledge of plugin configuration here?[m
[31m-    assets: this.config.assets,[m
[31m-[m
[31m-    // auth credentials service (i.e., for stash)[m
[31m-    authUrl: this.config.auth.url,[m
[31m-  };[m
[31m-};[m
[31m-[m
 [m
 [m
 Server.prototype.routes.get.containers = function(req, res, next) {[m
[36m@@ -688,130 +816,4 @@[m [mServer.prototype.routes.del['builds/:id'] = function(req, res, next) {[m
   });[m
 };[m
 [m
[31m-[m
[31m-Server.prototype.resetContainerIdleTimeout = function(container, set, log) {[m
[31m-  var idleTimeout = this.config.containerIdleTimeout || '10m';[m
[31m-  var containerId = container.containerId;[m
[31m-[m
[31m-  var to = this.containerIdleTimeouts[containerId];[m
[31m-  if (set || to) {[m
[31m-    // reset timeout if it's already existing, or 'set' flag is set to true (we just started container)[m
[31m-[m
[31m-    clearTimeout(to);[m
[31m-    log.info({id: containerId}, `Resetting container idle timeout to ${ms(ms(idleTimeout))}`);[m
[31m-[m
[31m-    // stop container after the timeout[m
[31m-    this.containerIdleTimeouts[containerId] = setTimeout(function() {[m
[31m-      log.info({id: containerId}, 'Stopping container');[m
[31m-      container.stop();[m
[31m-    }, ms(idleTimeout));[m
[31m-  }[m
[31m-};[m
[31m-[m
[31m-/**[m
[31m- * Sets .container properties on the build with the status of the container. Values are:[m
[31m- * state:[m
[31m- *  "deleted" - if the docker container does not exist for the build[m
[31m- *  "stopped" - if the docker container exists and is stopped[m
[31m- *  "running" - if the docker container exists and is running[m
[31m- * disk:[m
[31m- *  .imageSize - size of the container's image in bytes, if container exists, null otherwise[m
[31m- *  .containerSize - size of the container's ownlayer in bytes, if container exists, null otherwise[m
[31m- */[m
[31m-Server.prototype.updateBuildContainerStatus = Promise.promisify(function(build, done) {[m
[31m-  var self = this;[m
[31m-  var container = new Container({[m
[31m-    docker: this.config.docker,[m
[31m-    containerId: build.container.id,[m
[31m-    log: this.log,[m
[31m-  });[m
[31m-[m
[31m-  function getState(cb) {[m
[31m-    container.getState(function(err, state) {[m
[31m-      if (err) {[m
[31m-        // 404 if container doesn't exist[m
[31m-        if (err.statusCode === 404) {[m
[31m-          return cb(null, 'deleted');[m
[31m-        }[m
[31m-        else {[m
[31m-          return cb(err);[m
[31m-        }[m
[31m-      }[m
[31m-[m
[31m-      cb(null, state.Running ? 'running' : 'stopped');[m
[31m-    });[m
[31m-  }[m
[31m-[m
[31m-  function getDiskUsage(cb) {[m
[31m-    container.getDiskUsage(function(err, usage) {[m
[31m-      if (err) {[m
[31m-        // log the error, but don't stop[m
[31m-        self.log.error({err}, `Can't get disk usage for container ${container.containerId}, continuing`);[m
[31m-      }[m
[31m-[m
[31m-      cb(null, usage);[m
[31m-    });[m
[31m-  }[m
[31m-[m
[31m-  async.parallel({[m
[31m-    disk: getDiskUsage,[m
[31m-    state: getState,[m
[31m-  }, function(err, results) {[m
[31m-    if (err) {[m
[31m-      return done(err);[m
[31m-    }[m
[31m-[m
[31m-    build.container.disk = results.disk;[m
[31m-    build.container.state = results.state;[m
[31m-[m
[31m-    done(null, build);[m
[31m-  });[m
[31m-});[m
[31m-[m
[31m-/**[m
[31m- * Get a build object by buildId.[m
[31m- * @param {object} buildId - Id of build to retreive[m
[31m- * @param {Function} done - Callback: function(err, build)[m
[31m- * @return {Promise} - The promise which will resolve wiht the build data.[m
[31m- */[m
[31m-Server.prototype.getBuildData = function(buildId, done) {[m
[31m-  return this.getFromDB('builds', buildId, done);[m
[31m-};[m
[31m-[m
[31m-Server.prototype.storeBuildData = function(data, done) {[m
[31m-  data.updatedAt = new Date().toJSON();[m
[31m-  return this.storeInDB('builds', data, done);[m
[31m-};[m
[31m-[m
[31m-[m
[31m-// TODO: Move StoreInDB to the build class.[m
[31m-Server.prototype.storeInDB = function(key, data, done) {[m
[31m-  this.db.put(key + '!' + data.id, data, function(error) {[m
[31m-    done(error, data);[m
[31m-  });[m
[31m-};[m
[31m-[m
[31m-Server.prototype.delFromDB = function(key, id, done) {[m
[31m-  this.db.del(key + '!' + id, done);[m
[31m-};[m
[31m-[m
[31m-Server.prototype.getFromDB = function(key, id, done) {[m
[31m-  this.db.get(key + '!' + id, {valueEncoding: 'json'}, done);[m
[31m-};[m
[31m-[m
[31m-/**[m
[31m- * Stream data from the db with keys prefixed with 'key'. Data is streamed as JSON objects[m
[31m- *[m
[31m- * @param {string} key - The prefix to stream data from.[m
[31m- * @return {stream} - A read stream of database results.[m
[31m- */[m
[31m-Server.prototype.streamFromDB = function(key) {[m
[31m-  var readStream = this.db.createValueStream({[m
[31m-    gte: key + '!!',[m
[31m-    lte: key + '!~',[m
[31m-    valueEncoding: 'json',[m
[31m-  });[m
[31m-  return readStream;[m
[31m-};[m
[31m-[m
 module.exports = Server;[m
[1mdiff --git a/lib/plugins/Step/CodeDownloader.js b/lib/plugins/Step/CodeDownloader.js[m
[1mindex e54a238..e794403 100644[m
[1m--- a/lib/plugins/Step/CodeDownloader.js[m
[1m+++ b/lib/plugins/Step/CodeDownloader.js[m
[36m@@ -4,6 +4,8 @@[m [mvar downloaders = require('./CodeDownloader');[m
 class CodeDownloader {[m
 [m
   constructor(container, options, project) {[m
[32m+[m[32m    var Plugin = this.getPlugin(project.provider);[m
[32m+[m[32m    return new Plugin(container, options, project);[m
   }[m
 [m
   getPlugin(type) {[m
[1mdiff --git a/lib/plugins/Step/Script.js b/lib/plugins/Step/Script.js[m
[1mindex 59baec3..1182b3e 100644[m
[1m--- a/lib/plugins/Step/Script.js[m
[1m+++ b/lib/plugins/Step/Script.js[m
[36m@@ -48,7 +48,7 @@[m [mclass Script extends AbstractStep {[m
   }[m
 [m
   runScript() {[m
[31m-    this.stdInStream.write(this.script);[m
[32m+[m[32m    this.stdin.write(this.script);[m
   }[m
 [m
   buildCommand() {[m
