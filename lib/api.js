var util = require('util');
var url = require('url');
var request = require('superagent');

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

  var r = request[method](full_url)
          .set("Authorization", authorization);

  return r
}

/**
 * Submits build to the API server to be run
 */
API.prototype.submitBuild = function(project_id, build, cb){
  var self = this;
  this._http("/projects/"+project_id+"/builds", "post").send(build).end(function(err, res){
    if(err) return cb(err);

    var build = res.body;

    self._http("/builds/" + build.id + "?join=project").end(function(err, res){
      cb(err, !err && res.body);
    });

  });
}

/**
 * Looks up project by service ('github'), slug ('zanchin/testrepo'), and host (optional)
 * Returns a project object if found.
 */
API.prototype.findProjectByRepo = function(service, slug, host, cb){
  this._http("/projects").query({service: service, slug: slug, host: host, single: true}).end(function(err, res){
    cb(err, !err && res.body);
  });
}

module.exports = API;
