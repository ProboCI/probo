'use strict';

const async = require('async');
const bunyan = require('bunyan');
const createWebhookHandler = require('github-webhook-handler');
const requestLogger = require('probo-request-logger');
const restify = require('restify');

const API = require('./api');
const GitHub = require('./GitHub');

/**
 * Create a queue that only processes one task at a time.
 * A task is simply a function that takes a callback when it's done
 */
var statusUpdateQueue = async.queue(function worker(fn, cb) {
  fn(cb);
}, 1);

class GitHubHandler {

  constructor(config, logger) {
    this.config = config;

    // Instantiate a logger instance.
    this.logger = logger || bunyan.createLogger({
      name: 'github-handler',
      level: config.logLevel || 'debug',
      // src: true,
      serializers: {
        err: bunyan.stdSerializers.err,
        req: bunyan.stdSerializers.req,
      },
    });

    this.github = new GitHub(this.config, this.logger);

    this.webhookOptions = {
      path: config.githubWebhookPath,
      secret: config.githubWebhookSecret,
    };

    // Sets up the path for the GitHub webhooks.
    this.handler = this._createWebhookHandler();

    this.server = restify.createServer({log: this.logger, name: 'Probo GHH'});

    // Set ups the server and routes for the Probo GitLab Handler.
    this._setupServer();
    this._setupRoutes();

    this.api = API.getAPI({
      url: this.config.api.url,
      token: this.config.api.token,
      log: this.logger,
      // {url, [host|hostname], [protocol], [port]}
      handler: this.config,
    });

    if (!(this.api instanceof API)) {
      this.logger.info('api.token not found, using Container Manager API directly');
    }
  }

  /**
   * Starts the server.
   *
   * @param {function} cb - The callback function
   */
  start(cb) {
    this.server.listen({port: this.config.port, host: this.config.hostname || '0.0.0.0'}, () => {
      this.logger.info('Now listening on', this.server.url);

      if (cb) cb();
    });
  }

  /**
   * Closes the server.
   *
   * @param {function} cb - The callback function
   */
  close(cb) {
    const url = this.server.url;
    this.server.close(() => {
      this.logger.info('Stopped', url);

      if (cb) cb();
    });
  }

  /**
   * Creates a GitLab Webhook Handler.
   *
   * @return {object} - An initialized webhook handler server.
   */
  _createWebhookHandler() {
    let handler = createWebhookHandler(this.webhookOptions);

    handler.on('error', error => {
      this.logger.error({err: error}, 'An error occurred.');
    });

    handler.on('pull_request', this.pullRequestHandler.bind(this));

    return handler;
  }

  /**
   * Sets up the server for the Probo GitLab Handler.
   */
  _setupServer() {
    this.server.use(restify.plugins.queryParser());

    // Adds Probo's request logger
    this.server.use(requestLogger({logger: this.logger}));

    // Sets up request logging
    this.server.use((req, res, next) => {
      this.logger.info({req: req}, 'REQUEST');
      next();
    });

    this.server.on('after', restify.plugins.auditLogger({
      log: this.logger,
      event: 'after',
    }));
  }

  /**
   * Sets up the routes for the Probo GitLab Handler.
   *
   * These routes corresponds to the webhook handler and the status update
   * paths.
   */
  _setupRoutes() {
    // For requests to webhook handler path, make the webhook handler take care
    // of the requests.
    this.server.post(this.webhookOptions.path, (req, res, next) => {
      this.handler(req, res, error => {
        res.send(400, 'Error processing hook');
        this.logger.error({err: error}, 'Error processing hook');

        next();
      });
    });

    this.server.post('/builds/:bid/status/:context', restify.plugins.jsonBodyParser(), this.buildStatusController.bind(this));
    this.server.post('/update', restify.plugins.jsonBodyParser(), this.buildStatusController.bind(this));

    this.server.get('/pull-request/:owner/:repo/:pullRequestNumber', this.getPullRequest.bind(this));
  }

  /**
   * Called on a build status update event.
   *
   * @param {object} req - The request to the server.
   * @param {object} res - The server response
   * @param {object} next - The chain of handlers for the request.
   */
  buildStatusController(req, res, next) {
    const payload = req.body;

    if (req.params.context) {
      // Usually, context will already be part of update, but read it from URL
      // if it's there for compatability
      payload.update.context = req.params.context;
    }

    this.logger.debug({payload: payload}, 'Update payload');

    this.buildStatusUpdateHandler(payload.update, payload.build, (err, status) => {
      if (err) {
        res.send(500, {error: err});
      }
      else {
        res.send(status);
      }
      return next();
    });
  }

  /**
   * The handler for merge request events from GitHub webhooks.
   *
   * @param {object} event - The merge request event.
   * @param {function} cb - The callback to be called after the update is performed.
   */
  pullRequestHandler(event, cb) {
    this.logger.info('Github Pull request ' + event.payload.pull_request.id + ' received');

    // We only want to take action on open and synchronize events (for
    // now, we'll seen want to take action on close events as well).
    if (event.payload.action !== 'opened' && event.payload.action !== 'synchronize') {
      this.logger.info(`Github Pull request ${event.payload.pull_request.id} ${event.payload.action} ignored`);

      cb();
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
    this.processPullRequest(request, (error, build) => {
      this.logger.info({type: request.type, slug: request.slug, err: error}, 'request processed');
      if (cb) {
        cb(error, build);
      }
    });
  }

  /**
   * Update the status on GitHub.
   *
   * @param {object} update - The update object.
   * @param {string} update.state: "status of build",
   * @param {string} update.description - The text discription of the build state.
   * @param {string} update.context - The context used to differentiate this update from other services and steps.
   * @param {string} update.target_url: The url to link to from the status update.
   * @param {object} build - The full build object.
   * @param {object} build.project - The embedded project object.
   * @param {function} cb - The callback to be called after the update is performed.
   */
  buildStatusUpdateHandler(update, build, cb) {
    this.logger.info({update: update, build_id: build.id}, 'Got build status update');

    // Create a mapping of states that Github accepts
    const stateMap = {
      running: 'pending',
      pending: 'pending',
      success: 'success',
      error: 'failure',
    };

    const statusInfo = {
      // Can be one of pending, success, error, or failure.
      state: stateMap[update.state],
      description: update.description.substring(0, 140),
      context: update.context,
      target_url: update.target_url,
    };

    const task = this.github.postStatus.bind(this.github, build.project, build.commit.ref, statusInfo);
    statusUpdateQueue.push(task, error => {
      if (error) {
        this.logger.error({err: error, build_id: build.id}, 'An error occurred posting status to GitHub');
        return cb(error, statusInfo);
      }

      this.logger.info(statusInfo, 'Posted status to Github for', build.project.slug, build.commit.ref);
      cb(null, statusInfo);
    });
  }

  /**
   * Processes a pull request and submits a Probo build.
   *
   * @param {object} request - The incoming hook request data.
   * @param {string} request.type - The type of request to process (eg pull_request).
   * @param {string} request.service - The service to be checked (always gitlab in this handler).
   * @param {string} request.slug - The identifier for the repo (repository.full_name from the gitlab api).
   * @param {string} request.event - The entire event payload from the gitlab api call.
   * @param {function} cb - The callback to call when finished.
   */
  processPullRequest(request, cb) {
    this.logger.info({type: request.type, id: request.id}, 'Processing request');

    this.api.findProjectByRepo(request, (error, project) => {
      if (error || !project) {
        return this.logger.info({error}, `Project for github repo ${request.slug} not found`);
      }

      this.logger.info({project: project}, 'Found project for PR');

      this.github.fetchProboYamlConfig(project, request.sha, (error, config) => {
        let build;

        if (error) {
          this.logger.error({err: error}, 'Problem fetching Probo Yaml Config file');

          // If we can't find a yaml file we should error.
          build = {
            commit: {ref: request.sha},
            project: project,
          };
          const update = {
            state: 'failure',
            description: error.message,
            context: 'ProboCI/env',
          };

          return this.buildStatusUpdateHandler(update, build, cb);
        }

        this.logger.info({config: config}, 'Probo Yaml Config file');

        this.submitBuild(request, project, config, cb);
      });
    });
  }

  /**
   * Called on a get PR request. Returns a PR info.
   *
   * @param {object} req - The request to the server.
   * @param {object} res - The server response
   * @param {object} next - The chain of handlers for the request.
   */
  getPullRequest(req, res, next) {
    const github = this.github.getApi({service_auth: {token: req.query.token}});

    let opts = {
      user: req.params.owner,
      repo: req.params.repo,
      number: req.params.pullRequestNumber,
    };

    github.pullRequests.get(opts, (error, pullRequest) => {
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
  }

  /**
   * Submits a Probo build request.
   *
   * @param {object} request - Information on the repo/branch/commit to build.
   * @param {object} project - The project to build.
   * @param {string} config - The probo YAML config file.
   * @param {function} cb - The callback to call when finished.
   */
  submitBuild(request, project, config, cb) {
    let build = {
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

    this.api.submitBuild(build, project, (err, submittedBuild) => {
      if (err) {
        // TODO: save the PR if submitting it fails (though logging it here might be ok)
        self.log.error({
          err: err,
          request: request,
          build: build,
          response: submittedBuild,
        }, 'Problem submitting build');

        return cb && cb(err);
      }

      this.logger.info({build: submittedBuild}, 'Submitted build');

      cb(null, submittedBuild);
    });
  }

}

module.exports = GitHubHandler;
