'use strict';

var util = require('util');
var url = require('url');
var Promise = require('bluebird');
var API = require('./api');

/**
 * Coordinator API client that bypasses the coordinator and uses the container manager and provider handler directly.
 * @class
 * @extends API
 *
 * @param {Object} config - Settings for the API calls. See {@link API} for normal config parameters in addition to the ones below.
 * @param {Object} config.handler - object that points to a provider push handler (such as the GHH). Used to send build status updates.
 * @param {string} config.handler.url - URL for the handler (protocol, host, port)
 * @param {string} config.handler.host - if URL isn't set, the host of the handler. Can also be hostname
 * @param {string} config.handler.hostname - if URL isn't set, the host of the handler.
 * @param {string} config.handler.port=80 - if URL isn't set, the port of the handler
 * @param {string} config.handler.protocol=http - if URL isn't set, the protocol of the handler
 * @param {string} config.handler.githubAPIToken - Github API token (from config file) to make GHH API calls
 */
var CMAPI = function(config) {
  API.call(this, config);

  var handler = this.handler = config.handler;

  if (handler && !handler.url) {
    handler.url = url.format({
      host: handler.host || handler.hostname,
      port: handler.port || '80',
      protocol: handler.protocol || 'http',
    });
  }
};
util.inherits(CMAPI, API);

/**
 * Sets or updates the build status by build id and context.
 *
 * @param {Object} build - The object representing the build:
 * @param {Object} build.project - See postStatusToBitbucket prototype.
 * @param {Object} build.commit - An object that contains at least .ref, which is the sha for the build.
 * @param {string} context - The context to set on the status.
 * @param {string} status - A status message to post.
 * @param {function} cb - A callback to perform after the build status is set.
 * @return {Object} - Returns the result of the setBuildStatus call. Probably trivial.
 */
CMAPI.prototype.setBuildStatus = function(build, context, status, cb) {
  status = this.formatStatus(status);

  status.context = context;
  if (this.config.buildUrl) {
    status.target_url = this.config.buildUrl.replace('{{buildId}}', build.id);

    status.target_url = status.target_url.replace('{{repo}}', build.project.repo);

    status.target_url = status.target_url.replace('{{owner}}', build.project.owner);

    // Encode the pull request URL as base64 to prevent any problems.
    // https://stackoverflow.com/questions/246801/how-can-you-encode-a-string-to-base64-in-javascript/247261
    var b = new Buffer(build.request.pull_request_html_url);
    status.target_url = status.target_url.replace('{{pullRequestUrl}}', b.toString('base64'));

    build.pullRequest.name = build.pullRequest.name.replace(' ', '%20');
    status.target_url = status.target_url.replace('{{pullRequestName}}', build.pullRequest.name);

    build.request.payload.pullrequest.author.display_name = build.request.payload.pullrequest.author.display_name.replace(' ', '%20');
    status.target_url = status.target_url.replace('{{authorName}}', build.request.payload.pullrequest.author.display_name);
  }

  this.log.debug({update: build}, 'Setting build status update');

  // reformat the status into the {update, build} form so the GHH has full context
  status = {
    update: status,
    build: build,
  };

  return API.prototype.setBuildStatus.call(this, build, context, status, cb);
};

CMAPI.prototype.findProjectByRepo = function(request, cb) {
  this.log.info('returning static project object');

  var self = this;
  setImmediate(function() {
    cb(null, {
      id: request.slug.replace('/', '-'),
      provider_id: request.repo_id,
      owner: request.owner,
      repo: request.repo,
      slug: request.slug,
      service_auth: {token: self.handler.githubAPIToken, type: 'token'},
      provider: {type: 'github', slug: 'github'},
    });
  });
};

// promisifyAll requires bluebird
Promise.promisifyAll(CMAPI.prototype);

module.exports = CMAPI;
