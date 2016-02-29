'use strict';

var util = require('util');
var url = require('url');
var bunyan = require('bunyan');
var Promise = require('bluebird');
var _ = require('lodash');

/**
 * Coordinator API client that bypasses the coordinator and uses the container manager and provider handler directly.
 * @class
 *
 * @param {Object} config - Settings for the API calls
 * @param {string} config.url - URL for the coordinator, including protocol, host, port
 * @param {string} [config.log] - bunyan log instance to use (child will be created and used). If not supplied, a new instance will be created
 * @param {string} [config.protocol=http] - If {@link config.url} is not supplied, protocol for coordinator
 * @param {string} [config.host] - If {@link config.url} is not supplied, host for coordinator
 * @param {string} [config.port] - If {@link config.url} is not supplied, port for coordinator
 */
var API = function(config) {
  if (config.host) {
    config.url = url.format({
      host: config.host,
      port: config.port,
      protocol: config.protocol,
    });
  }

  this.server = {
    url: config.url,
  };

  this.token = config.token;

  if (config.log) {
    this.log = config.log.child({component: 'api-client'});
  }
  else {
    this.log = bunyan.createLogger({name: 'api-client', level: 'debug'});
  }

  this.config = config;

  this.log.info({server: this.server}, 'CM Coordinator API instantiated');
};

/**
 * @param {Object} config - See {@link API} and {@link CMAPI}
 * @return {Object} - An instance of {@link API} or {@link CMAPI} depending on whether .token is passed in as well. If config.token exists, an instance of {@link CMAPI} is returned
 *
 * @static
 */
API.getAPI = function(config) {
  var Cls = config.token ? API : require('./cm_api');

  return new Cls(config);
};

API.prototype._http = function(path, method) {
  var fullUrl = util.format('%s%s', this.server.url, path);
  var authorization = util.format('Bearer %s', this.token);

  method = (method || 'GET').toLowerCase();

  var request = require('superagent');
  var r = request[method](fullUrl)
          .set('Authorization', authorization);

  return r;
};

/**
 * Submits build to the API server to be run
 *
 * @param {object} build - The build object.
 * @param {object} project - The project to be built object.
 * @param {function} cb - The callback to call when complete.
 */
API.prototype.submitBuild = function(build, project, cb) {
  var body = {build: build, project: project};
  this._http('/startbuild', 'post').send(body).end(function(err, res) {
    if (err) return cb(err, res.body);

    var build = res.body;

    cb(null, build);
  });
};

/**
 * Pretty processes the status update.
 * Tranlsates the optional status.action into an icon in the description
 * @param {string} status - The status to translate.
 * @return {string} - The utf-8 icon to use.
 */
API.prototype.formatStatus = function(status) {
  var icons = {running: '▶', pending: '⌛', finished: '■'};
  var icon = icons[status.action];

  if (icon) {
    status.description = `[${icon}] ${status.description}`;
  }

  // we no longer need the .action field
  delete status.action;

  return status;
};


API.prototype.setBuildStatus = function(build, context, status, cb) {
  status = this.formatStatus(status);

  // allow contexts with a slash in it, which need to be encoded to not break routing
  var escapedContext = require('querystring').escape(context);

  var self = this;
  this._http('/builds/' + build.id + '/status/' + escapedContext, 'post').send(status).end(function(err, res) {
    if (err) {
      self.log.error({err: err, build_id: build.id}, 'An error occurred updating build status');
      return cb && cb(err);
    }

    var updatedStatus = res.body;

    var logEntry = _.pick(updatedStatus, 'context', 'state', 'description');
    logEntry.task = updatedStatus.task && updatedStatus.task.name;
    self.log.info({status: logEntry}, 'Build status updated for build', build.id);

    if (cb) {
      cb(null, updatedStatus);
    }
  });
};

/**
 * Looks up project by provider slug ('github') and repo slug ('zanchin/testrepo').
 *
 * @param {object} request - The raw request object.
 * @param {string} request.service - The service used by the incoming request.
 * @param {string} request.slug - The slug representation of the project name.
 * @param {function} cb - The callback to call when complete.
 */
API.prototype.findProjectByRepo = function(request, cb) {
  this._http('/projects').query({
    service: request.service,
    slug: request.slug,
    single: true,
  }).end(function(err, res) {
    cb(err, !err && res.body);
  });
};

Promise.promisifyAll(API.prototype);

module.exports = API;
