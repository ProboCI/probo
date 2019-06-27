'use strict';

const bunyan = require('bunyan');
const querystring = require('querystring');
const util = require('util');
const url = require('url');

/**
 * The Coordinator API client that bypasses the coordinator and uses the
 * container manager and provider handler directly.
 */
class API {

  /**
   * @param {Object} config - Settings for the API calls
   * @param {string} config.url - URL for the coordinator, including protocol, host, port
   * @param {string} [config.log] - bunyan log instance to use (child will be created and used). If not supplied, a new instance will be created
   * @param {string} [config.protocol=http] - If {@link config.url} is not supplied, protocol for coordinator
   * @param {string} [config.host] - If {@link config.url} is not supplied, host for coordinator
   * @param {string} [config.port] - If {@link config.url} is not supplied, port for coordinator
   */
  constructor(config) {
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
  }

  /**
   * Returns an instance of {@link API} or {@link CMAPI}
   *
   * The return value depends on whether .token is passed in as well. If
   * `config.token` exists, an instance of {@link CMAPI} is returned.
   *
   * @param {Object} config - See {@link API} and {@link CMAPI}
   *
   * @return {Cls} - An instantiated API object.
   */
  static getAPI(config) {
    var Cls = config.token ? API : require('./cm_api');

    return new Cls(config);
  }

  _http(path, method) {
    var fullUrl = util.format('%s%s', this.server.url, path);
    var authorization = util.format('Bearer %s', this.token);
    var requestMethod = (method || 'GET').toLowerCase();
    var request = require('superagent');

    return request[requestMethod](fullUrl).set('Authorization', authorization);
  }

  submitBuild(build, project, cb) {
    var body = {build: build, project: project};
    this._http('/startbuild', 'post')
      .send(body)
      .end((err, res) => {
        if (err) return cb(err, res && res.body);

        var build = res.body;
        cb(null, build);
      });
  }

  /**
   * Pretty processes the status update.
   *
   * @param {object} status - The status object.
   * @return {String} - Translation of status.action to an icon.
   */
  formatStatus(status) {
    var icons = {running: '▶', pending: '⌛', finished: '■'};
    var icon = icons[status.action];

    if (icon) {
      status.description = `[${icon}] ${status.description}`;
    }

    // we no longer need the .action field
    delete status.action;

    return status;
  }

  /**
   * Sets or updates the build status by build id and context.
   *
   * @param {Object} build - The build object.
   * @param {String} context - The string representing the name of the task.
   * @param {String} status - Whether the build was successful.
   * @param {Function} cb - The callback function.
   */
  setBuildStatus(build, context, status, cb) {
    status = this.formatStatus(status);

    // Allow contexts with a slash in it, which need to be encoded to not break
    // routing.
    context = querystring.escape(context);

    this._http(`/builds/${build.id}/status/${context}`, 'post')
      .send(status)
      .end((err, res) => {
        if (err) {
          this.log.error({err: err, buildId: build.id}, 'An error occurred updating build status');
          return cb && cb(err);
        }

        var updatedStatus = res.body;
        this.log.info({status: updatedStatus}, 'Build status updated for build', build.id);

        if (cb) cb(null, status);
      });
  }

  /**
   * Sets or updates the build status by build id and context.
   *
   * @param {Object} build - The build object.
   * @param {String} context - The string representing the name of the task.
   * @param {String} status - Whether the build was successful.
   * @return {Promise} - A promise.
   */
  async setBuildStatusAsync(build, context, status) {
    status = this.formatStatus(status);

    // Allow contexts with a slash in it, which need to be encoded to not break
    // routing.
    context = querystring.escape(context);

    return this._http(`/builds/${build.id}/status/${context}`, 'post')
      .send(status)
      .then(res => {
        var updatedStatus = res.body;
        this.log.info({status: updatedStatus}, 'Build status updated for build', build.id);

        return Promise.resolve(status);
      })
      .catch(err => {
        this.log.error({err: err, buildId: build.id}, 'An error occurred updating build status');

        return Promise.reject(err);
      });
  }

  /**
   * Looks up project by provider slug and repo slug.
   *
   * The provider slug is something like 'bitbucket' while the repo slug is
   * something like 'zanchin/testrepo'. This method returns a project object if
   * found.
   *
   * @param {Request} request - The request object.
   * @param {Function} cb - The callback to call when completed.
   */
  findProjectByRepo(request, cb) {
    this._http('/projects')
      .query({
        service: request.service,
        slug: request.slug,
        single: true,
      })
      .end((err, res) => {
        cb(err, !err && res.body);
      });
  }

}

module.exports = API;
