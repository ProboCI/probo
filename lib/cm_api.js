var util = require('util');
var url = require('url');

var request = require('superagent');
var API = require('./api');

/**
 * @class
 * @extends API
 * Coordinator API client that bypasses the coordinator and uses the container manager and provider handler directly.
 *
 * @param {Object} config - Settings for the API calls. See {@link API} for normal config parameters in addition to the ones below.
 * @param {Object} config.handler - object that points to a provider push handler (such as the GHH). Used to send build status updates.
 * @param {string} config.handler.url - URL for the handler (protocol, host, port)
 * @param {string} [config.handler.host] - if URL isn't set, the host of the handler. Can also be hostname
 * @param {string} [config.handler.hostname] - if URL isn't set, the host of the handler.
 * @param {string} [config.handler.port=80] - if URL isn't set, the port of the handler
 * @param {string} [config.handler.protocol=http] - if URL isn't set, the protocol of the handler
 * @param {string} config.handler.githubAPIToken - Github API token (from config file) to make GHH API calls
 */
var CMAPI = function(config){
  API.call(this, config);

  var handler = this.handler = config.handler;

  if(!handler.url){
    handler.url = url.format({
      host: handler.host || handler.hostname,
      port: handler.port || "80",
      protocol: handler.protocol || "http"
    });
  }
}
util.inherits(CMAPI, API);

/**
 * Sets or updates the build status by build id and context.
 */
CMAPI.prototype.setBuildStatus = function(build, context, status, cb){
  status = this.formatStatus(status)

  status.target_url = "http://probo.ci/builds/" + build.id;
  status.context = context;

  var handler_url = util.format("%s/update", this.handler.url);

  this.log.debug({update: status}, "Setting build status update to", handler_url);
  var log = this.log;

  request.post(handler_url).send({
    update: status,
    build: build
  }).end(function(err){
    if(err){
      log.error({err: err}, "Build update failed");
    }
    cb && cb(err);
  });
}

/**
 * Returns a static project object based on paramters in request.
 */
CMAPI.prototype.findProjectByRepo = function(request, cb){
  this.log.info("returning static project object");

  var self = this;
  setImmediate(function(){
    cb(null, {
      // do we need these for the OS version?
      // service: request.service,
      // host: request.host,

      owner: request.owner,
      repo: request.repo,
      slug: request.slug,
      service_auth: {token: self.handler.githubAPIToken, type: 'token'}
    });
  });
}

// promisifyAll requires bluebird
var Promise = require('bluebird');
Promise.promisifyAll(CMAPI.prototype);

module.exports = CMAPI;
