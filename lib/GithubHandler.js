var path = require('path')
  ,http = require('http')
  ,async = require('async')
  ,restify = require('restify')
  ,request = require('request')
  ,createWebhookHandler = require('github-webhook-handler')
  ,bunyan = require('bunyan')
  ,yaml = require('js-yaml')
;

var GitHubApi = require("github");

var API = require('./api');
var CMAPI = require('./cm_api');


var GithubHandler = function(options) {

  this.options = options;

  // Bind functions to ensure `this` works for use in callbacks.
  this.start = this.start.bind(this);
  this.fetchProboYamlConfigFromGithub = this.fetchProboYamlConfigFromGithub.bind(this);
  this.errorHandler = this.errorHandler.bind(this);
  this.pullRequestHandler = this.pullRequestHandler.bind(this);
  this.getGithubApi = this.getGithubApi.bind(this);

  // Instantiate a logger instance.
  var log  = bunyan.createLogger({name: 'github-handler',
                                  level: 'debug',
                                  // src: true,
                                  serializers: {
                                    err: bunyan.stdSerializers.err
                                  }});
  var options = {
    path: options.githubWebhookPath,
    secret: options.githubWebhookSecret,
  };

  var handler = createWebhookHandler(options);
  handler.on('error', this.errorHandler);
  handler.on('pull_request', this.pullRequestHandler);

  var self = this;

  this.server = restify.createServer({log: log, name: "Probo GHH"});

  this.server.post(options.path, function(req, res, next){
    handler(req, res, function(error) {
      res.send(400, 'Error processing hook');
      log.error({ err: error}, 'Error processing hook');
      next();
    });
  });

  this.server.post("/update", restify.jsonBodyParser(), function(req, res, next){
    var payload = req.body;

    self.buildStatusUpdateHandler(payload.update, payload.build, function(err){
      if(err){
        res.send(500, {error: JSON.stringify(err)});
      } else {
        res.send({success: true});
      }
      return next();
    });
  });

  this.log = log;

  if(this.options.api.token){
    this.api = new API({
      url: this.options.api.url,
      token: this.options.api.token,
      log: this.log
    })
  } else {
    // use container manager directly
    log.info("api.token not found, using Container Manager API directly");
    this.api = new CMAPI({
      url: this.options.api.url,
      log: this.log,
      ghh: this
    })
  }
};

/**
 * Starts the server listening on the configured port.
 */
GithubHandler.prototype.start = function(cb) {
  var self = this;
  this.server.listen({port: self.options.port, host: self.options.hostname || '0.0.0.0'}, function() {
    self.log.info('Now listening on', self.server.url);
    cb && cb();
  });
};

GithubHandler.prototype.stop = function(cb) {
  var self = this;
  this.server.close(function() {
    self.log.info('Stopped', self.server.url);
    cb && cb();
  });
};

/**
 * Build options for GitHub api HTTP requests.
 */
GithubHandler.prototype.getGithubApi = function(project) {
  var github = new GitHubApi({
    // required
    version: "3.0.0",
    // optional
    // debug: true,
    protocol: "https",
    // host: "github.my-GHE-enabled-company.com",
    // pathPrefix: "/api/v3", // for some GHEs
    timeout: 5000,
    headers: {
      "user-agent": "Probo" // GitHub is happy with a unique user agent
    }
  });

  var auth = project.service_auth || {token: this.options.githubAPIToken, type: 'token'};
  github.authenticate(auth);

  return github;
}

/**
 * Error handler for Github webhooks.
 */
GithubHandler.prototype.errorHandler = function(error) {
  this.log.error({err: error}, 'An error occurred.');
};


/**
 * Handler for pull request events.
 */
GithubHandler.prototype.pullRequestHandler = function(event, cb) {
  // enqueue the event to be processed...
  var self = this;

  this.log.info('Github Pull request ' + event.payload.pull_request.id + ' received');

  var request = {
    type: 'pull_request', // also in event.event
    service: 'github',
    host: undefined,
    slug: event.payload.repository.full_name,
    owner: event.payload.repository.owner.login,
    repo: event.payload.repository.name,
    sha: event.payload.pull_request.head.sha,
    payload: event.payload,
    id: event.payload.pull_request.id
  }

  /**
   * build comes back with an embedded .project
   * not necessary to do anything here, build status updates will come asyncronously
   */
  this.processRequest(request, function(error, build){
    self.log.info({type: request.type, slug: request.slug, err: error}, "request processed");
    cb && cb(error, build);
  });
}

/**
 * Called when an build status updates
 *
 * update = {
 *  state: "status of build",
 *  description: "",
 *  context: "the context",
 *  target_url: ""
 * }
 *
 * build has an embedded .project too
 */
GithubHandler.prototype.buildStatusUpdateHandler = function(update, build, cb){
  var self = this;
  self.log.info({update: update, build_id: build.id}, "Got build status update");

  var statusInfo = {
    state: update.state,  // can be one of pending, success, error, or failure.
    description: update.description,
    context: update.context,
    target_url: update.target_url
  }

  self.postStatusToGithub(build.project, build.ref, statusInfo, function(error){
    if (error) {
      self.log.error({ err: error, build_id: build.id }, 'An error occurred posting status to GitHub');
      return cb(error);
    }

    self.log.info(statusInfo, 'Posted status to Github for', build.project.slug, build.ref);
    cb();
  });
}

/**
 * request: {type, service, slug, event}
 */
GithubHandler.prototype.processRequest = function(request, cb){
  var self = this;
  self.log.info({type: request.type, id: request.id}, 'Processing request');

  this.api.findProjectByRepo(request, function(error, project){
    if(error || !project){
      return self.log.info(
        {err: error},
        "Project for github repo " + request.slug + " not found"
      );
    }

    self.log.info({project: project}, "Found project for PR");

    self.fetchProboYamlConfigFromGithub(project, request.sha, function(error, config) {
      self.log.info({err: error, config: config}, "Probo Yaml Config file");

      if(error){
        return;
      }

      var build = {
        ref: request.sha,
        config: config,
        request: request
      };

      self.api.submitBuild(build, project, function(err, build){
        if(err){
          // TODO: though the PR if submitting it fails (though logging it here might be ok)
          self.log.error({err: err, request: request, build: build}, "Problem submitting build");
          return cb && cb(err);
        }

        self.log.info({build: build}, "Submitted build");

        self.log.info("Updating build statuses...");

        self.api.setBuildStatus(build, "ci/tests", {
          state: "pending", description: "Waiting on environment " + new Date()
        });
        self.api.setBuildStatus(build, "ci/env", {
          state: "pending", description: "Building environment " + new Date()
        }, function _(){
          // running tests now
          setTimeout(function(){
            self.api.setBuildStatus(build, "ci/env", {
              state: "success", description: "Environment built " + new Date()
            });

            self.api.setBuildStatus(build, "ci/tests", {
              state: "pending", description: "Running tests " + new Date()
            }, function response(error, status){

              setTimeout(function(){
                self.api.setBuildStatus(build, "ci/tests", {
                  state: "success", description: "Tests passed " + new Date()
                }, function _(){

                });
              }, 2000);
            });
          }, 2000);

          self.log.debug("returning from initial HTTP call")
          cb();
        });
      });

    });
  });
};

/**
 * Posts status updates to Github.
 *
 * statusInfo should be the status message to post to GH - see https://developer.github.com/v3/repos/statuses/
 */
GithubHandler.prototype.postStatusToGithub = function(project, sha, statusInfo, done) {
  var self = this;
  var github = self.getGithubApi(project);

  statusInfo.user = project.owner;
  statusInfo.repo = project.repo;
  statusInfo.sha = sha;

  github.statuses.create(statusInfo, function(error, body){
    done(error, body);
  })
}

/**
 * Fetches configuration from a .probo.yml file in the github repo.
 */
GithubHandler.prototype.fetchProboYamlConfigFromGithub = function(project, sha, done) {
  var self = this;
  var path = '/contents?ref=' + sha;
  var github = this.getGithubApi(project);

  github.repos.getContent({user: project.owner, repo: project.repo, ref: sha, path: ''}, function(error, files){
    if (error) return done(error)

    var i = null;
    var regex = /^(.?probo.ya?ml|.?proviso.ya?ml)$/;
    var match = false;
    var file;
    for (i in files) {
      file = files[i];
      if (regex.test(file.name)) {
        match = true;
        break;
      }
    }
    if (!match) {
      // Should this be an error or just an empty config?
      return done(new Error('No .probo.yml file was found.'));
    }

    github.repos.getContent({user: project.owner, repo: project.repo, ref: sha, path: file.path}, function(error, file){
      if (error) {
        self.log.error({error: error}, "Failed to get probo config file contents");

        return done(error);
      }

      var content = new Buffer(file.content, 'base64');
      var settings = yaml.safeLoad(content.toString('utf8'));

      done(null, settings);
    });
  });
};

module.exports = GithubHandler;
