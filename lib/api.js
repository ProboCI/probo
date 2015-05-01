var util = require('util');
var url = require('url');

/**
 * config = {url, token, log}
 */
var API = function(config){
  if(config.host){
    config.url = url.format({
      host: config.host,
      port: config.port,
      protocol: config.protocol
    });
  }

  this.server = {
    url: config.url
  }

  this.token = config.token;

  if(config.log){
    this.log = config.log.child({component: "api-client"})
  } else {
    var bunyan = require('bunyan');
    this.log = bunyan.createLogger({ name: 'api-client', level: 'debug' });
  }
}

API.prototype._http = function(path, method){
  var full_url = util.format("%s%s", this.server.url, path);
  var authorization = util.format("Bearer %s", this.token);

  method = (method || "GET").toLowerCase();

  var request = require('superagent');
  var r = request[method](full_url)
          .set("Authorization", authorization);

  return r
}

/**
 * Submits build to the API server to be run
 */
API.prototype.submitBuild = function(build, project, cb){
  var self = this;

  build.request = {omitted: true}

  var body = {build: build, project: project};
  this._http("/startbuild", "post").send(body).end(function(err, res){
    if(err) return cb(err);

    var build = res.body;

    cb(null, build);
  });
}

/**
 * Sets or updates the build status by build id and context
 */
API.prototype.setBuildStatus = function(build, context, status, cb){
  // allow contexts with a slash in it, which need to be encoded to not break routing
  context = require('querystring').escape(context);

  var self = this;
  this._http("/builds/" + build.id + "/status/" + context, "post").send(status).end(function(err, res){
    if(err){
      self.log.error({ err: err, build_id: build.id }, 'An error occurred updating build status');
      return cb && cb(err);
    }

    var updated_status = res.body;
    self.log.info({status: updated_status}, 'Build status updated for build', build.id);

    cb && cb(null, status);
  });
}

/**
 * Looks up project by service ('github'), slug ('zanchin/testrepo'), and host (optional)
 * Returns a project object if found.
 */
API.prototype.findProjectByRepo = function(request, cb){
  this._http("/projects").query({
    service: request.service,
    slug: request.slug,
    host: request.host,
    single: true
  }).end(function(err, res){
    cb(err, !err && res.body);
  });
}

module.exports = API;
