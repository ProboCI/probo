var path = require('path')
  ,http = require('http')
  ,async = require('async')
  ,restify = require('restify')
  ,request = require('request')
  ,createWebhookHandler = require('github-webhook-handler')
  ,bunyan = require('bunyan')
  ,yaml = require('js-yaml')
;

var GithubHandler = function(options) {

  this.options = options;

  // Bind functions to ensure `this` works for use in callbacks.
  this.start = this.start.bind(this);
  this.fetchProvisoYamlConfigFromGithub = this.fetchProvisoYamlConfigFromGithub.bind(this);
  this.pullRequestHandler = this.pullRequestHandler.bind(this);
  this.getRequestDefaultOptions = this.getRequestDefaultOptions.bind(this);

  // Instantiate a logger instance.
  var log  = bunyan.createLogger({name: 'github-handler',
                                 serializers: {
                                   err: bunyan.stdSerializers.err
                                 }});
  var options = {
    path: options.githubWebhookPath,
    secret: options.githubWebhookSecret,
  };

  var handler = createWebhookHandler(options);
  handler.on('error', this.errorHandler.bind(this));
  handler.on('pull_request', this.pullRequestHandler);

  this.server = http.createServer(function(req, res) {
    handler(req, res, function(error) {
      res.writeHead(404);
      log.error({ err: error}, '404 endpoint not found');
      res.end('Not found');
    });
  });
  this.log = log;
};

/**
 * Starts the server listening on the configured port.
 */
GithubHandler.prototype.start = function(cb) {
  var self = this;
  this.server.listen(self.options.port, function() {
    self.log.info('Now listening on port ' + self.server.address().port);
    cb && cb();
  });
};

/**
 * Build options for GitHub api HTTP requests.
 */
GithubHandler.prototype.getRequestDefaultOptions = function(account, repo, path) {
  return {
    url: 'https://api.github.com/repos/' + account + '/' + repo + path,
    json: true,
    headers: {
      'Authorization': 'token ' + this.options.githubAPIToken,
      'User-Agent': 'Proviso',
    },
  };
}

/**
 * Error handler for Github webhooks.
 */
GithubHandler.prototype.errorHandler = function(error) {
//  console.log(error.stack)
  this.log.error({err: error}, 'An error occurred.');
};

/**
 * Handler pfor pull request events.
 */
GithubHandler.prototype.pullRequestHandler = function(event) {
  var self = this;
  var pullRequest = event.payload.pull_request;
  self.log.info('Github Pull request ' + pullRequest.id + ' received');
  // TODO: Lookup whether we should be acting upon this repository?
  self.fetchProvisoYamlConfigFromGithub(pullRequest, function(error, data) {

    self.log.info("data:", data);
    return;

    var tasks = [];
    var statusInfo = {
      state: 'success',
      description: 'Your CI environment was created!',
      context: 'Proviso CI Environment',
      target_url: 'https://tizzo-awesome-drupal-project-pr-3.proviso.ci',
    }
    tasks.push(self.postStatusToGithub.bind(self, pullRequest, statusInfo));
    var testInfo = {
      state: 'success',
      description: 'Your tests are running...',
      context: 'Proviso CI' + config.context,
      target_url: 'https://tizzo-awesome-drupal-project-pr-3.proviso.ci',
    };
    tasks.push(self.postStatusToGithub.bind(self, pullRequest, testInfo));
    async.parallel(tasks, function(error) {
      if (error) {
        return self.log.error({ err: error }, 'An error occurred posting status to GitHub');
      }
      self.log.info(statusInfo, 'Posted status to Github for Pull Request ' + pullRequest.id);
    });
  });
};

/**
 * Posts status updates to Github.
 *
 * statusInfo should be the status message to post to GH - see https://developer.github.com/v3/repos/statuses/
 */
GithubHandler.prototype.postStatusToGithub = function(pullRequest, statusInfo, done) {
  var self = this;
  var repo = pullRequest.head.repo;
  var options = self.getRequestDefaultOptions(repo.owner.login, repo.name, '/statuses/' + pullRequest.head.sha);
  options.body = statusInfo;
  request.post(options, function(error, response, body) {
    done(error, body);
  });
}

/**
 * Fetches configuration from a .proviso.yml file in the github repo.
 */
GithubHandler.prototype.fetchProvisoYamlConfigFromGithub = function(pullRequest, done) {
  var self = this;
  var user = pullRequest.head.repo.owner.login;
  var repo = pullRequest.head.repo.name;
  var path = '/contents?ref=' + pullRequest.head.sha;
  var options = this.getRequestDefaultOptions(user, repo, path);
  request(options, function(error, response, files) {
    if (error) return done(error)
    var i = null;
    var regex = /.?proviso.ya?ml/;
    var match = false;
    for (i in files) {
      var file = files[i];
      if (regex.test(file.name)) {
        match = true;
        break;
      }
    }
    if (!match) {
      // Should this be an error or just an empty config?
      done(new Error('No .proviso.yml file was found.'));
    }
    options.url = file.url;
    request(options, function(error, response, file) {
      if (error) return done(error);
      var content = new Buffer(file.content, 'base64');
      var settings = yaml.safeLoad(content.toString('utf8'));
      done(null, settings);
    });
  });
};

module.exports = GithubHandler;
