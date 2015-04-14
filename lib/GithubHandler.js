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


var GithubHandler = function(options) {

  this.options = options;

  // Bind functions to ensure `this` works for use in callbacks.
  this.start = this.start.bind(this);
  this.fetchProvisoYamlConfigFromGithub = this.fetchProvisoYamlConfigFromGithub.bind(this);
  this.errorHandler = this.errorHandler.bind(this);
  this.pullRequestHandler = this.pullRequestHandler.bind(this);
  this.getGithubApi = this.getGithubApi.bind(this);

  // Instantiate a logger instance.
  var log  = bunyan.createLogger({name: 'github-handler',
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

  // TODO: use restify for this
  this.server = http.createServer(function(req, res) {
    if(req.url == options.path){
      handler(req, res, function(error) {
        res.writeHead(404);
        log.error({ err: error}, '404 endpoint not found');
        res.end('Not found');
      });
    }
    // our own custom routing for now
    else if(req.url == "/update"){
      var bl = require('bl')

      req.pipe(bl(function(err, data){
        var payload;
        try {
          payload = JSON.parse(data.toString())
        } catch (e) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({error: "Bad payload: " + e.message, body: data.toString()}));
          return;
        }

        self.buildStatusUpdateHandler(payload.update, payload.build, function(err){
          res.writeHead(err ? 500 : 200, { 'content-type': 'application/json' }, err)

          if(err){
            res.end(JSON.stringify({error: JSON.stringify(err)}));
          } else {
            res.end(JSON.stringify({success: true}));
          }
        });
      }));
    }
  });
  this.log = log;

  this.api = new API({
    url: this.options.api.url,
    token: this.options.api.token,
    log: this.log
  })
};

/**
 * Starts the server listening on the configured port.
 */
GithubHandler.prototype.start = function(cb) {
  var self = this;
  this.server.listen({port: self.options.port, host: '0.0.0.0'}, function() {
    self.log.info(self.server.address(), 'Now listening on');
    cb && cb();
  });
};

GithubHandler.prototype.stop = function(cb) {
  var self = this;
  this.server.close(function() {
    self.log.info(self.server.address(), 'Stopped');
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
      "user-agent": "Proviso" // GitHub is happy with a unique user agent
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
GithubHandler.prototype.pullRequestHandler = function(event) {
  // enqueue the event to be processed...
  var self = this;

  this.log.info('Github Pull request ' + event.payload.pull_request.id + ' received');

  // 1. [DONE] GHH sends commit to API
  // 2. [TODO] API starts container manager
  // 3. [DONE] Container manager sends status updates back to the API
  // 4. [DONE] API udpates GHH (which updates github)
  //    Sends GH token for GHH to use with request
  //    GHH has a default token that it uses if it's not provided


  var request = {
    type: 'pull_request', // also in event.event
    service: 'github',
    host: undefined,
    slug: event.payload.repository.full_name,
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
  });
}

/**
 * Called when an build status updates
 *
 * update = {
 *  status: "status of build",
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
    state: update.status,  // can be one of pending, success, error, or failure.
    description: update.description,
    context: update.context,
    target_url: update.target_url
  }

  self.postStatusToGithub(build.project, build.sha, statusInfo, function(error){
    if (error) {
      self.log.error({ err: error, build_id: build.id }, 'An error occurred posting status to GitHub');
      return cb(error);
    }

    self.log.info(statusInfo, 'Posted status to Github for Pull Request ' + request.id);
    cb();
  });
}

/**
 * request: {type, service, slug, event}
 */
GithubHandler.prototype.processRequest = function(request, cb){
  var self = this;
  self.log.info({type: request.type, id: request.id}, 'Processing request');

  this.api.findProjectByRepo(request.service, request.slug, request.host, function(error, project){
    if(error || !project){
      return self.log.info(
        {err: error},
        "Project for github repo " + request.slug + " not found"
      );
    }

    self.log.info({project: project}, "Found project for PR");

    self.fetchProvisoYamlConfigFromGithub(project, request.sha, function(error, config) {
      self.log.info({err: error, config: config}, "Proviso Yaml Config file");

      var build = {
        status: 'pending',
        sha: request.sha,
        config: config,
        request: request
      };

      self.api.submitBuild(project.id, build, function(err, build){
        if(err){
          // TODO: though the PR if submitting it fails (though logging it here might be ok)
          self.log.error({err: err, request: request, build: build}, "Problem submitting build");
          return cb && cb(err);
        }

        self.log.info({build: build}, "Submitted build");

        var statusInfo = {
          state: "pending",
          description: "Building environment " + new Date(),
          context: "ci/env"
        }

        self.postStatusToGithub(build.project, build.sha, statusInfo, function(error){
          if (error) {
            self.log.error({ err: error, build_id: build.id }, 'An error occurred posting status to GitHub');
            return cb();
          }

          self.log.info(statusInfo, 'Posted status to Github for Pull Request ' + request.id);
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
 * Fetches configuration from a .proviso.yml file in the github repo.
 */
GithubHandler.prototype.fetchProvisoYamlConfigFromGithub = function(project, sha, done) {
  var self = this;
  var path = '/contents?ref=' + sha;
  var github = this.getGithubApi(project);
  github.repos.getContent({user: project.owner, repo: project.repo, ref: sha, path: ''}, function(error, files){
    if (error) return done(error)

    var i = null;
    var regex = /.?proviso.ya?ml/;
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
      done(new Error('No .proviso.yml file was found.'));
    }

    github.repos.getContent({user: project.owner, repo: project.repo, ref: sha, path: file.path}, function(error, file){
      if (error) return done(error);
      var content = new Buffer(file.content, 'base64');
      var settings = yaml.safeLoad(content.toString('utf8'));
      done(null, settings);
    });
  });
};

module.exports = GithubHandler;
