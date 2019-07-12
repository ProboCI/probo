'use strict';

const GitHubApi = require('@octokit/rest');
const yaml = require('js-yaml');

class GitHub {

  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Builds options for GitLab API and returns a client object.
   *
   * @param {Object.<string, string>} project - A project object.
   * @return {import("@octokit/rest") } The GitHub client object.
   */
  getApi(project) {
    let options = {
      baseUrl: 'https://api.github.com',

      // GitHub requires a unique user agent.
      userAgent: 'Probo.CI',

      request: {
        timeout: 5000,
      },

      auth: `${this.config.githubAPIToken}`,
    };

    if (project.service_auth) {
      options.auth = `token ${project.service_auth.token}`;
    }

    return new GitHubApi(options);
  }

  /**
   * Fetches configuration from a .probo.yml file in the GitHub repo.
   *
   * @param {Object.<string, string>} project - The project object.
   * @param {string} sha - The git commit id to fetch the .probo.yaml from.
   * @param {(err: Error, [res]) => void} cb - The callback to call upon error/completion.
   */
  fetchProboYamlConfig(project, sha, cb) {
    const github = this.getApi(project);

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
          return cb(new Error('No .probo.yml file was found.'));
        }

        return this.fetchYamlFile(project, sha, file.path);
      })
      .then(settings => {
        cb(null, settings);
      })
      .catch(err => {
        this.logger.error({err: err}, 'Failed to get probo config file contents');

        return cb(err);
      });
  }

  /**
   * Fetches a YAML file from a GitHub repo.
   *
   * @param {Object.<string, any>} project - The project object.
   * @param {string} sha - The git commit id to fetch the file from.
   * @param {string} path - The file path.
   * @return {Promise<Object.<string, string>>} A promise
   */
  async fetchYamlFile(project, sha, path) {
    var github = this.getApi(project);

    return github.repos.getContents({owner: project.owner, repo: project.repo, ref: sha, path: path})
      .then(res => {

        // .probo.yml file was retrieved.
        let file = res.data;
        let content;
        let settings;

        try {
          content = new Buffer.from(file.content, 'base64');
          settings = yaml.safeLoad(content.toString('utf8'));
        }
        catch (e) {
          return Promise.reject(Error('Failed to parse probo config file:' + e.message));
        }

        return Promise.resolve(settings);
      })
      .catch(err => {
        this.logger.error(`Failed to get file ${path}`);

        return Promise.reject(err);
      });
  }

  /**
   * Posts status updates to Github.
   *
   * @param {Object.<string, any>} project - The project object to post the status for.
   * @param {string} sha - The git commit id that we are posting a status for.
   * @param {string} statusInfo - This should be the status message to post to GH. See https://developer.github.com/v3/repos/statuses/
   * @param {(err: Error, [res]) => void} cb - The callback to call when the status has been updated.
   */
  postStatus(project, sha, statusInfo, cb) {
    var github = this.getApi(project);

    statusInfo.owner = project.owner;
    statusInfo.repo = project.repo;
    statusInfo.sha = sha;

    github.repos.createStatus(statusInfo)
      .then(res => {
        cb(null, res);
      })
      .catch(err => {
        cb(Error(`Failed creating a status ${err}`));
      });
  }

  /**
   * Gets information on a pull request.
   *
   * @param {Object.<string, any>} query - The parameters for the request.
   * @param {string} query.owner - The GitHub repo owner.
   * @param {string} query.repo - The repo of the pull request.
   * @param {number} pull_number - The pull request number.
   * @param {string} query.token - The user token used for authentication.
   * @return {Promise<Object.<string, string | number>>} - A promise.
   */
  async getPullRequest(query) {
    const github = this.getApi({service_auth: {token: query.token}});

    return github.pullRequests.get(query)
      .then(pullRequest => {

        if (pullRequest.status !== 200) {
          return Promise.reject(pullRequest);
        }

        let output = {
          id: pullRequest.data.id,
          number: pullRequest.data.number,
          state: pullRequest.data.state,
          url: pullRequest.data.url,
          title: pullRequest.data.title,
          userName: pullRequest.data.user.login,
          userId: pullRequest.data.user.id,
        };

        return Promise.resolve(output);
      })
      .catch(err => Promise.reject(err));
  }

}

module.exports = GitHub;
