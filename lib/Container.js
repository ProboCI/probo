'use strict';

const bunyan = require('bunyan');
const Docker = require('dockerode');
const EventEmitter = require('events').EventEmitter;
const Promise = require('bluebird');
const through2 = require('through2');

const AssetDownloader = require('./plugins/TaskRunner/AssetDownloader');
const startup = require('./container_manager/startup');
const TaskRunnerPlugins = require('./plugins/TaskRunner');

// patch dockerode's container.inspect to take opts
require('./_patchDockerodeInspect');

const ASSET_DIR = '/assets';
const SRC_DIR = '/src';

function wrapCallbackWithEmitter(emitter, eventName, callback) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(eventName);
    emitter.emit.apply(emitter, args);

    if (callback) {
      callback.apply(emitter, arguments);
    }
  };
}

class Container extends EventEmitter {

  /**
   * Constructor for the container model.
   * @class
   *
   * @param {object} options - An options hash.
   * @param {object} options.assets - Assets server configuration for AssetDownloader.
   * @param {string} options.assets.url - Assets server URL.
   * @param {string} [options.assets.token] - API token for assets server.
   */
  constructor(options) {
    super(options);

    this.provisionerPlugins = TaskRunnerPlugins;

    this.docker = new Docker(options.docker);
    this.build = options.build;
    this.jobConfig = options.jobConfig;
    this.log = options.log ? options.log.child({component: 'container'}) : bunyan.createLogger({name: 'container'});
    this.containerName = options.containerName || null;
    this.id = options.containerId || null;
    this.container = this.id ? this.docker.getContainer(this.id) : null;
    this.image = options.image;
    this.imageConfig = options.imageConfig;
    this.binds = options.binds || [];

    // Whether to attach to log output.
    this.attachLogs = options.attachLogs || false;
    this.assetsOpts = options.assets;
    this.authUrl = options.authUrl;

    this.create = this.create.bind(this);

    // wrap emit method to also emit a generic event
    var _emit = this.emit;
    this.emit = function(event) {
      var args = Array.prototype.slice.call(arguments);

      // emit original event
      _emit.apply(this, args);

      // emit a "stateChange" event
      args.unshift('stateChange');
      _emit.apply(this, args);
    };
  }

  buildSetupTasks(cb) {
    var jobConfig = this.jobConfig;

    var container = this;
    var build = this.build;
    var project = build.project;

    var tasks = [];

    return new Promise(resolve => {
      // 1. Download the code
      var downloadSource = this._createDownloader(build, project);
      tasks.push(downloadSource);

      // 2. Download the assets
      if (jobConfig.assets && this.assetsOpts) {
        this.assetsOpts.bucket = (project.assets && project.assets.bucket) || project.id;
        this.assetsOpts.assets = jobConfig.assets;
        var ad = new AssetDownloader(container, this.assetsOpts);
        tasks.push(ad);
      }

      resolve(tasks);
    })
      .nodeify(cb);
  }

  _createDownloader(build, project) {
    // map provider type to downloader class name
    var downloaders = {
      github: 'GithubDownloader',
      gitlab: 'GitlabDownloader',
      stash: 'StashDownloader',
      bitbucket: 'BitbucketDownloader',
    };

    var providerType = project.provider.type;
    var plugin = downloaders[providerType];
    if (!plugin) {
      throw new Error('Download: unsupported provider type: ' + providerType);
    }

    // dynamically require and instantiate a downloder
    var Downloader;
    try {
      Downloader = require(`./plugins/TaskRunner/${plugin}`);
    }
    catch (e) {
      var msg = `Download: failed to load supported downloader for provider ${providerType}: ${e.message}`;
      this.log.error({err: e, plugin}, msg);
      throw new Error(msg);
    }

    return new Downloader(this, {build, project, auth_lookup_url: this.authUrl});
  }

  buildUserTasks(cb) {
    var self = this;
    var config = this.jobConfig;
    var tasks = [];

    return new Promise(resolve => {
      var steps = config.steps || [];
      steps = Array.isArray(steps) ? steps : [steps];

      steps.forEach(function(step) {
        var plugin = step.plugin || 'Shell';

        if (self.provisionerPlugins[plugin]) {
          var task = new self.provisionerPlugins[plugin](self, step);
          tasks.push(task);
        }
      });

      resolve(tasks);
    })
      .nodeify(cb);
  }

  /**
   * First class Promise method.
   *
   * helper method to run scripts, not
   * useful in an app because it doesn't pass up stream before its piped
   * out
   *
   * @return {boolean} - The status of the tasks.
   */
  runTasks() {
    this.emit('running tasks');

    var self = this;
    return this.buildUserTasks().each(function(task) {
      return task.run().then(function(result) {
        // result: {stream, exec (Promise), task}
        result.streams.combined.pipe(process.stdout);
        return result.exec.then(function(exec) {
          console.log('Exit code:', exec.ExitCode);

          self.emit('tasks complete', result);
          return result;
        });
      });
    });
  }

  runBuild(cb) {
    var self = this;
    self.create(function(error, containerData) {
      if (error) return cb(error);

      return self.runTasks().then(function(EvaluatedTasks) {
        return containerData;
      })
        .nodeify(cb);

    });
  }

  /**
   * Creates and starts this Docker container.
   *
   * The callback will be called with errors (if one occured).
   *
   * @param {(err: Error) => void} cb - The callback function.
   * @return {import('bluebird')}
   */
  create(cb) {
    this.emit('creating');
    cb = wrapCallbackWithEmitter(this, 'created', cb);

    const docker = this.docker;
    const options = this.getCreateOptions();

    return new Promise((resolve, reject) => {

      this.log.info({env: options.Env}, `Creating container for build ${this.build.id}`);

      docker.createContainer(options, (error, container) => {
        if (error) return reject(error);

        this.id = container.id;
        this.container = container;

        this.log.info(`Created container ${container.id}`);
        this.log.info(`Starting container ${container.id}`);

        if (this.attachLogs) {
          container.attach({stream: true, stdout: true, stderr: true}, (error, stream) => {
            // TODO: We should consider collecting log output from the node and
            // sending it to loom.
            container.modem.demuxStream(stream, self.createLogWriteStream(), self.createLogWriteStream());
          });
        }

        return this.firstStart(container, options.command)
          .then(containerInfo => {
            this.containerInfo = containerInfo;

            return resolve(containerInfo);
          })
          .catch(err => reject(err));

      });
    })
      .nodeify(cb);

  }

  /**
   * Returns the create option values for a container.
   *
   * This also returns the command to run the default services for the selected
   * image under the key `command`.
   *
   * `startup.sh` has initially something 'dummy' like `tail -f /dev/null`
   * just to keep the container running. It is later overwritten to include the
   * services to run when re-starting the container.
   * @see `processAtStart`
   *
   * @return {Object.<string, any>} - The options for a container creation.
   */
  getCreateOptions() {

    var commandInfo = startup.defaultCommandInfo(this.imageConfig, this.build.config);

    let branchName = this.build.branch ? this.build.branch.name : null;
    let branchLink = this.build.branch ? this.build.branch.htmlUrl : null;

    let options = {
      name: this.containerName,
      Image: this.image,
      ExposedPorts: commandInfo.exposedPorts,
      PortBindings: commandInfo.portBindings,
      Cmd: ['/bin/bash', '-c', '/startup.sh'],
      Env: [
        `ASSET_DIR=${ASSET_DIR}`,
        `BRANCH_NAME=${branchName}`,
        `BRANCH_LINK=${branchLink}`,
        `BUILD_ID=${this.build.id}`,
        `COMMIT_REF=${this.build.commit.ref}`,
        `COMMIT_LINK=${this.build.commit.htmlUrl}`,
        `PWD=${SRC_DIR}`,
        'PROBO_ENVIRONMENT=TRUE',
        `SRC_DIR=${SRC_DIR}`,
      ],

      command: commandInfo.command,
    };

    if (this.build.links && this.build.links.build) {
      options.Env.push(`BUILD_DOMAIN=${this.build.links.build}`);
    }

    if (this.build.pullRequest) {
      if (this.build.pullRequest.htmlUrl) {
        options.Env.push(`PULL_REQUEST_LINK=${this.build.pullRequest.htmlUrl}`);
      }
      if (this.build.pullRequest.name) {
        options.Env.push(`PULL_REQUEST_NAME="${this.build.pullRequest.name}"`);
      }
    }

    return options;
  }

  /**
   * This is called right after the container is created.
   *
   * It makes sure the default services for the image are run before running any
   * of the other steps. This method also overrides the `/startup.sh` file to
   * include the default services + services declared in the .probo.yaml file.
   *
   * @param {import('dockerode').Container} container - The created container.
   * @param {string} command - The command to run the default services.
   */
  async firstStart(container, command) {

    try {
      await container.start();

      await this.processAtStart(container, command);

      let data = await container.inspect();

      return data;
    }
    catch (e) {
      this.log.error({err: e}, 'Error starting new container');

      return e;
    }
  }

  /**
   * Creates and runs docker exec instances for a new container.
   *
   * This method runs two main processes. The first one is proboscis with the
   * default services for the image. The second process uses `echo` to overwrite
   * the `startup.sh` file to include the default services + the user-defined
   * services, which will all be run once the container restarts.
   *
   * @param {import('dockerode').Container} container - The created container.
   * @param {string} command - The command to run the default services.
   */
  async processAtStart(container, command) {

    try {
      // Starts the default services before proceding with any steps.
      let exec = await container.exec({Cmd: ['/bin/bash', '-c', command]});
      await exec.start();

      // Appends the user-defined services to the default services and save them
      // in the startup script.
      command = startup.appendServices(command, this.build.config.services);
      let cmd = ['/bin/bash', '-c', `echo '${command}' > /startup.sh`];

      exec = await container.exec({Cmd: cmd});
      await exec.start();
    }
    catch (e) {
      this.log.error({error: e}, 'Error creating or running exec instances for new container');

      return e;
    }
  }

  /**
   * Returns the current status of the container
   *
   * @param {function} cb - the callback function, if provided
   * @return {function} - container inspect funnction, callback or promise
   */
  getState(cb) {
    return this.inspect()
      .then(function(info) { return info.State; })
      .asCallback(cb);
  }

  /**
   * Returns result of .inspect on container.
   *
   * @param {Object.<string, any>} opts - The options for the inspect call.
   * @param {(err: Error, info)} cb - The callback function.
   * @return {import('bluebird')}
   */
  inspect(opts, cb) {
    return new Promise((resolve, reject) => {
      this.container.inspect(opts, function(err, info) {
        if (err) return reject(err);

        return resolve(info);
      });
    })
      .nodeify(cb);
  }

  /**
   * Stops the container.
   *
   * @param {(err: Errr)} cb - The callback function.
   * @return {import('bluebird')}
   */
  stop(cb) {
    return new Promise((resolve, reject) => {
      this.emit('stopping');

      this.container.stop(err => {
        if (err) return reject(err);
      });

      resolve();
    })
      .nodeify(cb);
  }

  /**
   * Restarts (stop/start) container.
   *
   * @param {(err: Error)} cb - The callback function.
   * @return {import('bluebird')}
   */
  restart(cb) {
    return new Promise((resolve, reject) => {
      this.emit('restarting');
      cb = wrapCallbackWithEmitter(this, 'restarted', cb);

      this.container.restart(err => {
        if (err) return reject(err);
      });

      resolve();
    })
      .nodeify(cb);
  }

  /**
   * Starts container.
   *
   * @param {(err: Error)} cb - The callback function.
   * @return {import('bluebird')}
   */
  start(cb) {
    return new Promise((resolve, reject) => {
      this.emit('starting');
      cb = wrapCallbackWithEmitter(this, 'started', cb);

      this.container.start(err => {
        if (err) return reject(err);
      });

      resolve();
    })
      .nodeify(cb);
  }

  /**
   * Deletes container from the filesystem.
   *
   * @param {(err: Error)} cb - The callback function.
   * @return {import('bluebird')}
   */
  remove(opts, cb) {
    return new Promise((resolve, reject) => {
      this.emit('removing');

      cb = wrapCallbackWithEmitter(this, 'removed', cb);

      this.container.remove(opts, err => {
        if (err) return reject(err);
      });

      resolve();
    })
      .nodeify(cb);
  }

  /**
   * Retrieve container info getter.
   *
   * @param {object} data - container info data
   * @param {number} port - port number used on container
   * @return {function} - function to get container info
   */
  getExposedPortFromContainerInfo(data, port) {
    try {
      return data.NetworkSettings.Ports[port + '/tcp'][0].HostPort;
    }
    catch (e) {
      throw new Error('Could not find tcp port ' + port + ' on container ' + this.id);
    }
  }

  /**
   * Gets the disk usage of the container.
   * Current implementation requires the AUFS
   * Storage driver and to be run as root.
   * Errors if there's no root access or not using the AUFS driver
   *
   * @param {Function} cb - callback that takes err and an object as
   *  arguments. The object has {virtualBytes, realBytes}, for the
   *  size of the inderlying image and container layer respectively.
   */
  getDiskUsage(cb) {
    var result = {realBytes: null, virtualBytes: null};

    // stat the container to ensure that it's using the AUFS driver
    this.container.inspect({size: true}, function(err, info) {
      if (err) {
        return cb(null, result);
      }

      result.realBytes = (info.SizeRw || null);
      result.virtualBytes = (info.SizeRootFs || null);
      cb(null, result);
    });
  }

  /**
   * Get a log handler stream appropriate to piping output to.
   *
   * @param {object} options Options to pass to for the creation of the log stream.
   * @return {stream} - The stream to write log files to.
   */
  createLogWriteStream(options) {
    var stream = through2();
    stream.pipe(process.stdout);
    return stream;
  }

}

module.exports = Container;
