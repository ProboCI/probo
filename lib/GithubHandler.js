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

/**
 * Create a queue that only processes one task at a time.
 * A task is simply a function that takes a callback when it's done
 */
var status_update_queue = async.queue(function worker(fn, cb){
  fn(cb)
}, 1)


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
    level: options.log_level || 'debug',
    // src: true,
    serializers: {
      err: bunyan.stdSerializers.err,
      req: bunyan.stdSerializers.req
    }
  });
  var options = {
    path: options.githubWebhookPath,
    secret: options.githubWebhookSecret,
  };

  var handler = createWebhookHandler(options);
  handler.on('error', this.errorHandler);
  handler.on('pull_request', this.pullRequestHandler);

  var self = this;

  this.server = restify.createServer({log: log, name: "Probo GHH"});

  // set up request logging
  this.server.use(function (req, res, next) {
    req.log.info({req: req}, 'REQUEST');
    next();
  });
  this.server.on('after', restify.auditLogger({
    log: log
  }));

  this.server.post(options.path, function(req, res, next){
    handler(req, res, function(error) {
      res.send(400, 'Error processing hook');
      log.error({ err: error}, 'Error processing hook');
      next();
    });
  });

  var build_status_controller = function(req, res, next){
    var payload = req.body;

    if(req.params.context){
      // usually, context will already be part of update, but read it from URL
      // if it's there for compatability
      payload.update.context = req.params.context;
    }

    log.debug({payload: payload}, "Update payload");

    self.buildStatusUpdateHandler(payload.update, payload.build, function(err, status){
      if(err){
        res.send(500, {error: err});
      } else {
        res.send(status);
      }
      return next();
    });
  };

  this.server.post('/builds/:bid/status/:context', restify.jsonBodyParser(), build_status_controller)
  this.server.post("/update", restify.jsonBodyParser(), build_status_controller);

  this.log = log;

  this.api = API.getAPI({
    url: this.options.api.url,
    token: this.options.api.token,
    log: this.log,
    handler: this.options,  // {url, [host|hostname], [protocol], [port]}
  })

  if(!(this.api instanceof API)){
    log.info("api.token not found, using Container Manager API directly");
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
  var url = this.server.url;
  this.server.close(function() {
    self.log.info('Stopped', url);
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
    debug: true,
    protocol: "https",
    // host: "github.my-GHE-enabled-company.com",
    // pathPrefix: "/api/v3", // for some GHEs
    timeout: 5000,
    headers: {
      "user-agent": "Probo" // GitHub is happy with a unique user agent
    }
  });

  var auth = {type: 'token', token: this.options.githubAPIToken};
  if(project.service_auth){
    auth = {type: 'oauth', token: project.service_auth.token};
  }
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
    branch: event.payload.pull_request.head.ref,
    slug: event.payload.repository.full_name,
    owner: event.payload.repository.owner.login,
    repo: event.payload.repository.name,
    repo_id: event.payload.repository.id,
    sha: event.payload.pull_request.head.sha,
    pull_request: event.payload.pull_request.number,
    pull_request_id: event.payload.pull_request.id,
    payload: event.payload,
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

  var task = this.postStatusToGithub.bind(this, build.project, build.ref, statusInfo)
  status_update_queue.push(task, function(error){
    if (error) {
      self.log.error({ err: error, build_id: build.id }, 'An error occurred posting status to GitHub');
      return cb(error, statusInfo);
    }

    self.log.info(statusInfo, 'Posted status to Github for', build.project.slug, build.ref);
    cb(null, statusInfo);
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

      if (error) {
        // If we can't find a yaml file we should error.
        return self.buildStatusUpdateHandler(
          { // update
            state: 'failure',
            description: error.message,
            context: 'ProboCI/env',
          }, { // build
            ref: request.sha,
            project: project
          }, function(err){
            cb(err)
          })
      }

      var build = {
        ref: request.sha,
        pullRequest: request.pull_request + "",
        branch: request.branch,
        config: config,
        request: request
      };

      self.api.submitBuild(build, project, function(err, submitted_build){
        if(err){
          // TODO: save the PR if submitting it fails (though logging it here might be ok)
          self.log.error({err: err, request: request, build: build, response: submitted_build}, "Problem submitting build");
          return cb && cb(err);
        }

        self.log.info({build: submitted_build}, "Submitted build");

        cb(null, submitted_build)
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
        self.log.error({err: error}, "Failed to get probo config file contents");

        return done(error);
      }

      var content, settings
      try {
        content = new Buffer(file.content, 'base64');
        settings = yaml.safeLoad(content.toString('utf8'));
      } catch (e){
        return done(new Error(`Failed to parse ${file.path}:` + e.message));
      }

      done(null, settings);
    });
  });
};

module.exports = GithubHandler;
