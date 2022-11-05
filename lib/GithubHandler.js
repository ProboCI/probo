'use strict';

const async = require('async');
const createWebhookHandler = require('github-webhook-handler');
const requestLogger = require('probo-request-logger');
const restify = require('restify');

const API = require('./api');
const GitHub = require('./GitHub');
const logger = require('./logger');

/**
 * Create a queue that only processes one task at a time.
 * A task is simply a function that takes a callback when it's done
 */
var statusUpdateQueue = async.queue(function worker(fn, cb) {
  fn(cb);
}, 1);

class GitHubHandler {
  constructor(config, log) {
    this.config = config;

    // Instantiate a logger instance.
    this.logger = log || logger.get('github-handler');
    this.logger.level(config.logLevel);

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
      this.logger.info(
        'api.token not found, using Container Manager API directly',
      );
    }
  }

  /**
   * Starts the server.
   *
   * @param {() => void} cb - The callback function
   */
  start(cb) {
    this.server.listen(
      {port: this.config.port, host: this.config.hostname || '0.0.0.0'},
      () => {
        this.logger.info('Now listening on', this.server.url);

        if (cb) cb();
      },
    );
  }

  /**
   * Closes the server.
   *
   * @param {() => void} cb - The callback function
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
   * @return {import('github-webhook-handler')} - An initialized webhook handler server.
   */
  _createWebhookHandler() {
    let handler = createWebhookHandler(this.webhookOptions);

    handler.on('error', (error) => {
      this.logger.error({err: error}, 'An error occurred.');
    });

    handler.on('pull_request', this.pullRequestHandler.bind(this));
    handler.on('push', this.pushHandler.bind(this));

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

    this.server.on(
      'after',
      restify.plugins.auditLogger({
        log: this.logger,
        event: 'after',
      }),
    );
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
      this.handler(req, res, (error) => {
        res.send(400, 'Error processing hook');
        this.logger.error({err: error}, 'Error processing hook');

        next();
      });
    });

    this.server.post(
      '/builds/:bid/status/:context',
      restify.plugins.jsonBodyParser(),
      this.buildStatusController.bind(this),
    );
    this.server.post(
      '/update',
      restify.plugins.jsonBodyParser(),
      this.buildStatusController.bind(this),
    );
    this.server.post(
      '/builds/hash',
      restify.plugins.jsonBodyParser(),
      this.hashBuildController.bind(this),
    );

    this.server.get(
      '/pull-request/:owner/:repo/:pullRequestNumber',
      this.getPullRequest.bind(this),
    );
  }

  /**
   * Called on a build status update event.
   *
   * @param {import('restify').Request} req - The request to the server.
   * @param {import('restify').Response} res - The server response
   * @param {import('restify').Next} next - Next handler in the chain.
   */
  buildStatusController(req, res, next) {
    const payload = req.body;

    if (req.params.context) {
      // Usually, context will already be part of update, but read it from URL
      // if it's there for compatability
      payload.update.context = req.params.context;
    }

    this.logger.debug({payload: payload}, 'Update payload');

    this.buildStatusUpdateHandler(
      payload.update,
      payload.build,
      (err, status) => {
        if (err) {
          res.send(500, {error: err});
        }
        else {
          res.send(status);
        }
        return next();
      },
    );
  }

  /**
   * Called when user wants to create a build based on a commit hash.
   *
   * This controller gets info about the commit and submits a build request.
   *
   * @param {import('restify').Request} req - The request to the server.
   * @param {import('restify').Response} res - The server response
   * @param {import('restify').Next} next - Next handler in the chain.
   */
  hashBuildController(req, res, next) {
    this.logger.info(
      {
        owner: req.body.project.owner,
        repo: req.body.project.repo,
        sha: req.body.sha,
      },
      'Processing build for commit hash',
    );

    const project = req.body.project;
    const sha = req.body.sha;

    // The commit info is used to fill some info about the build when sending
    // a build request to coordinator.
    this.github.getCommit(project, sha, (err, commit) => {
      if (err) {
        this.logger.error({err: err}, 'Problem getting commit info.');
        res.send(500, {error: err});

        return next();
      }

      this.handleHashBuild(commit, project, sha, (err, build) => {
        if (err) {
          this.logger.error(
            {err: err},
            'Problem processing build for commit hash.',
          );
          res.send(500, {error: err});

          return next();
        }

        res.json(build);
        return next();
      });
    });
  }

  /**
   * Fetches the yaml configuration and submits build request.
   *
   * @param {Object.<string, string>} commit - The info on the commit.
   * @param {Object.<string, any>} project - The project object.
   * @param {string} sha - The hash of the commit to retrieve.
   * @param {(error: Error, [build]: Object.<string, any>)} cb - The callback
   *   function.
   */
  handleHashBuild(commit, project, sha, cb) {
    this.github.fetchProboYamlConfig(project, sha, (error, config) => {
      if (error) {
        this.logger.error(
          {err: error},
          'Problem fetching Probo Yaml Config file',
        );

        return cb(error);
      }

      const request = {
        sha: commit.sha,
        commit_url: commit.html_url,
        name: commit.message,
        type: 'hash',
      };

      this.submitBuild(request, project, config, cb);
    });
  }

  /**
   * The handler for pull request events from GitHub webhooks.
   *
   * @param {Object.<string, any>} event - The pull request event.
   * @param {(err: Error, [build]) => void} cb cb - The callback to be called
   *   after the update is performed.
   */
  pullRequestHandler(event, cb) {
    this.logger.info(
      `Github pull request ${event.payload.pull_request.id} received`,
    );

    // We only want to take action on open and synchronize events (for
    // now, we'll seen want to take action on close events as well).
    if (
      event.payload.action !== 'opened' &&
      event.payload.action !== 'synchronize'
    ) {
      this.logger.info(
        `Github Pull request ${event.payload.pull_request.id} ${event.payload.action} ignored`,
      );

      return;
    }

    const request = {
      type: 'pull_request',
      name: event.payload.pull_request.title,
      service: 'github',
      branch: {
        name: event.payload.pull_request.head.ref,
        html_url: `${event.payload.repository.html_url}/tree/${event.payload.pull_request.head.ref}`,
      },
      pull_request: {
        number: event.payload.pull_request.number,
        id: event.payload.pull_request.id,
        name: event.payload.pull_request.title,
        description: event.payload.pull_request.body,
        html_url: event.payload.pull_request._links.html.href,
      },
      slug: event.payload.repository.full_name,
      owner: event.payload.repository.owner.login,
      repo: event.payload.repository.name,
      repo_id: event.payload.repository.id,
      sha: event.payload.pull_request.head.sha,
      commit_url: `${event.payload.repository.html_url}/commit/${event.payload.pull_request.head.sha}`,
    };

    this.processWebhookEvent(request, (error, build) => {
      this.logger.info(
        {type: request.type, slug: request.slug, err: error},
        'Pull request processed',
      );

      return cb && cb(error, build);
    });
  }

  /**
   * The handler for push events from GitHub webhooks.
   *
   * @param {Object.<string, any>} event - The push event.
   * @param {(err: Error, [build]) => void} cb cb - The callback to be called
   *   after the update is performed.
   */
  pushHandler(event, cb) {
    this.logger.info('Github push event received');

    const payload = event.payload;
    const branch = payload.ref.replace('refs/heads/', '');

    const request = {
      type: 'branch',
      name: `Branch ${branch}`,
      service: 'github',
      branch: {
        name: branch,
        html_url: `${payload.repository.html_url}/tree/${branch}`,
      },
      slug: payload.repository.full_name,
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      repo_id: payload.repository.id,
      sha: payload.head_commit.id,
      commit_url: payload.head_commit.url,
      message: payload.head_commit.message,
    };

    this.processWebhookEvent(request, (error, build) => {
      this.logger.info(
        {type: request.type, slug: request.slug, err: error},
        'Push event processed',
      );

      return cb && cb(error, build);
    });
  }

  /**
   * Update the status on GitHub.
   *
   * @param {Object.<string, any>} update - The update object.
   * @param {string} update.state: "status of build",
   * @param {string} update.description - The text discription of the build
   *   state.
   * @param {string} update.context - The context used to differentiate this
   *   update from other services and steps.
   * @param {string} update.target_url: The url to link to from the status
   *   update.
   * @param {Object.<string, any>} build - The full build object.
   * @param {Object.<string, any>} build.project - The embedded project object.
   * @param {(err: Error, [build]) => void} cb - The callback to be called after
   *   the update is performed.
   */
  buildStatusUpdateHandler(update, build, cb) {
    this.logger.info(
      {update: update, build_id: build.id},
      'Got build status update',
    );

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

    const task = this.github.postStatus.bind(
      this.github,
      build.project,
      build.commit.ref,
      statusInfo,
    );
    statusUpdateQueue.push(task, (error) => {
      if (error) {
        this.logger.error(
          {err: error, build_id: build.id},
          'An error occurred posting status to GitHub',
        );
        return cb(error, statusInfo);
      }

      this.logger.info(
        statusInfo,
        'Posted status to Github for',
        build.project.slug,
        build.commit.ref,
      );
      cb(null, statusInfo);
    });
  }

  /**
   * Processes a webhook event and submits a Probo build.
   *
   * @param {Object.<string, any>} request - The incoming hook request data.
   * @param {string} request.type - The type of request to process (e.g.
   *   pull_request).
   * @param {string} request.slug - The identifier for the repo.
   * @param {(err: Error, [build]) => void} cb - The callback to call when
   *   finished.
   */
  processWebhookEvent(request, cb) {
    this.logger.info(
      {type: request.type, id: request.id},
      'Processing request',
    );

    this.api.findProjectByRepo(request, (error, project) => {
      if (error || !project) {
        this.logger.info(
          {error},
          `Project for GitHub repo ${request.slug} not found`,
        );

        return cb(error || new Error('Project not found'));
      }

      // If push event is for a branch and the branch is not enabled, do not
      // build. (03/09/2022 - we do not have an interface or way to enable branches
      // so we need to do that before we can enable this. This comes from the
      // coordinator (currently). Must think this through.
      if (request.type === 'branch') {
        // if (!project.branches || !project.branches[request.branch.name]) {
        if (request.message.indexOf('[build]') === -1) {
          return cb(null, null);
        }
      }

      this.processBuild(project, request, cb);
    });
  }

  /**
   * Process a build request for a project.
   *
   * @param {Object.<string, any>} project - The project object.
   * @param {Object.<string, any>} request - The incoming hook request data.
   * @param {(err: Error, [build]) => void} cb - The callback to call when
   *   finished.
   */
  processBuild(project, request, cb) {
    this.github.fetchProboYamlConfig(project, request.sha, (error, config) => {
      let build = {};

      if (error) {
        this.logger.error(
          {err: error},
          'Problem fetching Probo Yaml Config file',
        );

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
  }

  /**
   * Called on a get PR request. Returns a PR info.
   *
   * @param {import('restify').Request} req - The request to the server.
   * @param {import('restify').Response} res - The server response.
   * @param {import('restify').Next} next - Next handler in the chain.
   */
  getPullRequest(req, res, next) {
    let opts = {
      owner: req.params.owner,
      repo: req.params.repo,
      pull_number: req.params.pullRequestNumber,
      token: req.query.token,
    };

    this.github
      .getPullRequest(opts)
      .then((pullRequest) => {
        res.json(pullRequest);

        next();
      })
      .catch((err) => {
        res.json(500, err);

        next(err);
      });
  }

  /**
   * Submits a Probo build request.
   *
   * @param {Object.<string, string>} request - Information on the repo/branch/commit to build.
   * @param {Object.<string, any>} project - The project to build.
   * @param {Object.<string, any>} config - The probo YAML config file.
   * @param {(err: Error, [res]) => void} cb cb - The callback to call when finished.
   */
  submitBuild(request, project, config, cb) {
    let build = {
      commit: {
        ref: request.sha,
        htmlUrl: request.commit_url,
      },
      name: request.name,
      type: request.type,
      config: config,
    };

    // If build is for a pull request or push, branch information is passed.
    if (request.branch) {
      build.branch = {
        name: request.branch.name,
        htmlUrl: request.branch.html_url,
      };
    }

    // If build is for a pull request, extra information is passed.
    if (request.pull_request) {
      build.pullRequest = {
        number: request.pull_request.number + '',
        name: request.pull_request.name,
        description: request.pull_request.description,
        htmlUrl: request.pull_request.html_url,
      };
    }

    this.api.submitBuild(build, project, (err, submittedBuild) => {
      if (err) {
        // TODO: save the PR if submitting it fails (though logging it here might be ok)
        this.logger.error(
          {
            err: err,
            request: request,
            build: build,
            response: submittedBuild,
          },
          'Problem submitting build',
        );

        return cb && cb(err);
      }

      this.logger.info({build: submittedBuild}, 'Submitted build');

      cb(null, submittedBuild);
    });
  }
}

module.exports = GitHubHandler;
