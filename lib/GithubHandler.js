'use strict';

var async = require('async');
var bunyan = require('bunyan');
var createWebhookHandler = require('github-webhook-handler');
var GitHubApi = require('@octokit/rest');
var requestLogger = require('probo-request-logger');
var restify = require('restify');
var yaml = require('js-yaml');

var API = require('./api');

/**
 * Create a queue that only processes one task at a time.
 * A task is simply a function that takes a callback when it's done
 */
var statusUpdateQueue = async.queue(function worker(fn, done) {
  fn(done);
}, 1);


var GithubHandler = function(options) {

  this.options = options;

  // Bind functions to ensure `this` works for use in callbacks.
  this.start = this.start.bind(this);
  this.fetchProboYamlConfigFromGithub = this.fetchProboYamlConfigFromGithub.bind(this);
  this.errorHandler = this.errorHandler.bind(this);
  this.pullRequestHandler = this.pullRequestHandler.bind(this);
  this.getGithubApi = this.getGithubApi.bind(this);

  // Instantiate a logger instance.
  var log = bunyan.createLogger({name: 'github-handler',
    level: options.logLevel || 'debug',
    // src: true,
    serializers: {
      err: bunyan.stdSerializers.err,
      req: bunyan.stdSerializers.req,
    },
  });
  var webhookOptions = {
    path: options.githubWebhookPath,
    secret: options.githubWebhookSecret,
  };

  var handler = createWebhookHandler(webhookOptions);
  handler.on('error', this.errorHandler);
  handler.on('pull_request', this.pullRequestHandler);

  var self = this;

  this.server = restify.createServer({log: log, name: 'Probo GHH'});
  this.server.use(restify.plugins.queryParser());

  // Add probo's request logger
  this.server.use(requestLogger({logger: log}));

  // set up request logging
  this.server.use(function(req, res, next) {
    req.log.info({req: req}, 'REQUEST');
    next();
  });
  this.server.on('after', restify.plugins.auditLogger({
    log: log,
    event: 'after'
  }));

  this.server.post(webhookOptions.path, function(req, res, next) {
    handler(req, res, function(error) {
      res.send(400, 'Error processing hook');
      log.error({err: error}, 'Error processing hook');
      next();
    });
  });

  this.server.get('/pull-request/:owner/:repo/:pullRequestNumber', function(req, res, next) {
    var github = self.getGithubApi({service_auth: {token: req.query.token}});
    var opts = {
      user: req.params.owner,
      repo: req.params.repo,
      number: req.params.pullRequestNumber,
    };
    github.pullRequests.get(opts, function(error, pullRequest) {
      if (error) {
        res.json(500, error);
        return next();
      }
      var output = {
        id: pullRequest.id,
        number: pullRequest.number,
        state: pullRequest.state,
        url: pullRequest.url,
        title: pullRequest.title,
        userName: pullRequest.user.login,
        userId: pullRequest.user.id,
      };
      res.json(output);
      next();
    });
  });

  var buildStatusController = function(req, res, next) {
    var payload = req.body;

    if (req.params.context) {
      // usually, context will already be part of update, but read it from URL
      // if it's there for compatability
      payload.update.context = req.params.context;
    }

    log.debug({payload: payload}, 'Update payload');

    self.buildStatusUpdateHandler(payload.update, payload.build, function(err, status) {
      if (err) {
        res.send(500, {error: err});
      }
      else {
        res.send(status);
      }
      return next();
    });
  };

  this.server.post('/builds/:bid/status/:context', restify.plugins.jsonBodyParser(), buildStatusController);
  this.server.post('/update', restify.plugins.jsonBodyParser(), buildStatusController);

  this.log = log;

  this.api = API.getAPI({
    url: this.options.api.url,
    token: this.options.api.token,
    log: this.log,
    // {url, [host|hostname], [protocol], [port]}
    handler: this.options,
  });

  if (!(this.api instanceof API)) {
    log.info('api.token not found, using Container Manager API directly');
  }
};

GithubHandler.prototype.start = function(done) {
  var self = this;
  this.server.listen({port: self.options.port, host: self.options.hostname || '0.0.0.0'}, function() {
    self.log.info('Now listening on', self.server.url);
    if (done) {
      return done();
    }
  });
};

GithubHandler.prototype.stop = function(done) {
  var self = this;
  var url = this.server.url;
  this.server.close(function() {
    self.log.info('Stopped', url);
    if (done) {
      done();
    }
  });
};

/**
 * Build options for GitHub api HTTP requests.
 *
 * @param {object} project - A project object.
 * @return {object} An instantiated and configured Github API object.
 */
GithubHandler.prototype.getGithubApi = function(project) {
  var options = {
    baseUrl: 'https://api.github.com',

    // GitHub requires a unique user agent.
    userAgent: 'Probo.CI',

    request: {
      agent: undefined,
      fetch: undefined,
      timeout: 5000
    },

    auth: `token ${this.options.githubAPIToken}`,
  };

  if (project.service_auth) {
    options.auth = project.service_auth.token;
  }

  var github = new GitHubApi(options);

  return github;
};

/**
 * Error handler for Github webhooks.
 *
 * @param {Error} error - The error that occurred and is being handled.
 */
GithubHandler.prototype.errorHandler = function(error) {
  this.log.error({err: error}, 'An error occurred.');
};


GithubHandler.prototype.pullRequestHandler = function(event, done) {
  // enqueue the event to be processed...
  var self = this;

  this.log.info('Github Pull request ' + event.payload.pull_request.id + ' received');

  // We only want to take action on open and synchronize events (for
  // now, we'll seen want to take action on close events as well).
  if (event.payload.action !== 'opened' && event.payload.action !== 'synchronize') {
    this.log.info(`Github Pull request ${event.payload.pull_request.id} ${event.payload.action}  ignored`);
    return done();
  }

  var request = {
    // Also in event.event.
    type: 'pull_request',
    service: 'github',
    branch: event.payload.pull_request.head.ref,
    branch_html_url: event.payload.repository.html_url + '/tree/' + event.payload.pull_request.head.ref,
    slug: event.payload.repository.full_name,
    owner: event.payload.repository.owner.login,
    repo: event.payload.repository.name,
    repo_id: event.payload.repository.id,
    sha: event.payload.pull_request.head.sha,
    commit_url: event.payload.repository.html_url + '/commit/' + event.payload.pull_request.head.sha,
    pull_request: event.payload.pull_request.number,
    pull_request_id: event.payload.pull_request.id,
    pull_request_name: event.payload.pull_request.title,
    pull_request_description: event.payload.pull_request.body,
    pull_request_html_url: event.payload.pull_request._links.html.href,
    payload: event.payload,
  };

  // Build comes back with an embedded .project key.
  // It's not necessary to do anything here, build status updates will come asyncronously.
  this.processRequest(request, function(error, build) {
    self.log.info({type: request.type, slug: request.slug, err: error}, 'request processed');
    if (done) {
      return done(error, build);
    }
  });
};

/**
 * Called when an build status updates
 *
 * @param {object} update - The update object.
 * @param {string} update.state: "status of build",
 * @param {string} update.description - The text discription of the build state.
 * @param {string} update.context - The context used to differentiate this update from other services and steps.
 * @param {string} update.target_url: The url to link to from the status update.
 * @param {object} build - The full build object.
 * @param {object} build.project - The embedded project object.
 * @param {function} done - The callback to be called after the update is performed.
 */
GithubHandler.prototype.buildStatusUpdateHandler = function(update, build, done) {
  var self = this;
  self.log.info({update: update, build_id: build.id}, 'Got build status update');

  // Create a mapping of states that Github accepts
  var stateMap = {
    running: 'pending',
    pending: 'pending',
    success: 'success',
    error: 'failure',
  };

  var statusInfo = {
    // Can be one of pending, success, error, or failure.
    state: stateMap[update.state],
    description: update.description.substring(0, 140),
    context: update.context,
    target_url: update.target_url,
  };

  var task = this.postStatusToGithub.bind(this, build.project, build.commit.ref, statusInfo);
  statusUpdateQueue.push(task, function(error) {
    if (error) {
      self.log.error({err: error, build_id: build.id}, 'An error occurred posting status to GitHub');
      return done(error, statusInfo);
    }

    self.log.info(statusInfo, 'Posted status to Github for', build.project.slug, build.commit.ref);
    done(null, statusInfo);
  });
};

/**
 * @param {object} request - The incoming hook request data.
 * @param {string} request.type - The type of request to process (eg pull_request).
 * @param {string} request.service - The service to be checked (always github in this handler).
 * @param {string} request.slug - The identifier for the repo (repository.full_name from the github api).
 * @param {string} request.event - The entire event payload from the github api call.
 * @param {function} done - The callback to call when finished.
 */
GithubHandler.prototype.processRequest = function(request, done) {
  var self = this;
  self.log.info({type: request.type, id: request.id}, 'Processing request');

  this.api.findProjectByRepo(request, function(error, project) {
    if (error || !project) {
      return self.log.info({error}, `Project for github repo ${request.slug} not found`);
    }

    self.log.info({project: project}, 'Found project for PR');

    self.fetchProboYamlConfigFromGithub(project, request.sha, function(error, config) {
      var build;

      if (error) {
        self.log.error({err: error}, 'Problem fetching Probo Yaml Config file');

        // If we can't find a yaml file we should error.
        build = {
          commit: {ref: request.sha},
          project: project,
        };
        var update = {
          state: 'failure',
          description: error.message,
          context: 'ProboCI/env',
        };
        return self.buildStatusUpdateHandler(update, build, done);
      }

      self.log.info({config: config}, 'Probo Yaml Config file');

      build = {
        commit: {
          ref: request.sha,
          htmlUrl: request.commit_url,
        },
        pullRequest: {
          number: request.pull_request + '',
          name: request.pull_request_name,
          description: request.pull_request_description,
          htmlUrl: request.pull_request_html_url,
        },
        branch: {
          name: request.branch,
          htmlUrl: request.branch_html_url,
        },
        config: config,
        request: request,
      };

      self.api.submitBuild(build, project, function(err, submittedBuild) {
        if (err) {
          // TODO: save the PR if submitting it fails (though logging it here might be ok)
          self.log.error({err: err, request: request, build: build, response: submittedBuild}, 'Problem submitting build');
          return done && done(err);
        }

        self.log.info({build: submittedBuild}, 'Submitted build');

        done(null, submittedBuild);
      });

    });
  });
};


/**
 * Posts status updates to Github.
 *
 * @param {object} project - The project object to post the status for.
 * @param {string} sha - The git commit id that we are posting a status for.
 * @param {string} statusInfo - This should be the status message to post to GH. See https://developer.github.com/v3/repos/statuses/
 * @param {function} done - The callback to call when the status has been updated.
 */
GithubHandler.prototype.postStatusToGithub = function(project, sha, statusInfo, done) {
  var self = this;
  var github = self.getGithubApi(project);

  console.log(statusInfo);

  statusInfo.owner = project.owner;
  statusInfo.repo = project.repo;
  statusInfo.sha = sha;

  github.repos.createStatus(statusInfo)
    .then(res => {
      done(null, res);
    })
    .catch(err => {
      done(Error(`Failed creating a status ${err}`));
    });
};

/**
 * Fetches configuration from a .probo.yml file in the github repo.
 *
 * @param {object} project - The project object.
 * @param {string} sha - The git commit id to fetch the .probo.yaml from.
 * @param {function} done - The callback to call upon error/completion.
 */
GithubHandler.prototype.fetchProboYamlConfigFromGithub = function(project, sha, done) {
  var self = this;
  var github = this.getGithubApi(project);

  github.repos.getContents({owner: project.owner, repo: project.repo, ref: sha, path: ''})
    .then(res => {
      var i = null;
      var regex = /^(.?probo.ya?ml|.?proviso.ya?ml)$/;
      var match = false;

      var files = res.data;
      var file;
      for (i in files) {
        if (files[i]) {
          file = files[i];
          if (regex.test(file.name)) {
            match = true;
            break;
          }
        }
      }

      if (!match) {
        // Should this be an error or just an empty config?
        return done(new Error('No .probo.yml file was found.'));
      }

      return this.fetchAFile(project, sha, file.path);
    })
    .then(res => {
      // .probo.yml file was retrieved.
      var file = res.data;
      var content;
      var settings;

      try {
        content = new Buffer(file.content, 'base64');
        settings = yaml.safeLoad(content.toString('utf8'));
      }
      catch (e) {
        return done(new Error(`Failed to parse probo config file:` + e.message));
      }

      done(null, settings);
    })
    .catch(err => {
      self.log.error({err: err}, 'Failed to get probo config file contents');
      return done(err);
    });
};

/**
 * @param {object} project - The project object.
 * @param {string} sha - The git commit id to fetch the file from.
 * @param {string} path - The file path.
 * @return {Promise}
 */
GithubHandler.prototype.fetchAFile = async function(project, sha, path) {
  var github = this.getGithubApi(project);

  return github.repos.getContents({owner: project.owner, repo: project.repo, ref: sha, path: path})
    .then(res => {
      return Promise.resolve(res);
    })
    .catch(err => {
      this.log.error(`Failed to get file ${path}`);
      return Promise.reject(err);
    });
}

module.exports = GithubHandler;
