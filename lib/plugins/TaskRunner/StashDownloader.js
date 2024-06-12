'use strict';

var Promise = require('bluebird');
var request = require('request');

module.exports = class StashDownloader extends require('./Script') {

  /**
   * @param {object} container - The Docerode container object.
   * @param {object} options - Configuration options used by this task.
   * @param {object} options.build - build object, properties used:
   *      - ref (refspec of the commit)
   *      - config.removeCachedSourceCode: whether or not to delete cached source
   * @param {object} options.project: project object, properties used:
   *      - provider.type: Must be "stash", otherwise throws an error
   *      - provider.slug: Provider identifier
   *      - provider.*: Other provider properties specific to Stash
   *      - owner: Repository owner (stash project or owner slug)
   *      - repo: Repository slug (just the repo name)
   *      - service_auth.token: OAuth1.0 token
   *      - service_auth.tokenSecret: OAuth1.0 token secret
   *   - ref: can be used to override build.ref (for example to pull down merged PR commit)
   *   - auth_lookup_url: stash handler URL for authorization requests, including protocol
   */
  constructor(container, options) {
    super(container, options);

    var build = this.build = options.build;
    var project = this.project = options.project;

    if (project.provider.type !== 'stash') {
      throw new Error('Unsupported provider type: ' + project.provider.type);
    }

    this.params = {
      providerUrl: project.provider.stash.url,
      owner: project.owner,
      repo: project.repo,
      token: project.service_auth.token,
      tokenSecret: project.service_auth.tokenSecret,
      ref: options.ref || build.commit.ref,
      format: 'tar.gz',
    };

    // delay run function until we've done an async action

    var run = this.run;
    var self = this;

    /**
     *
     * Overrides AbstractPlugin::run to lookup OAuth1.0 credentials before running actual task.
     */
    this.run = Promise.promisify(function(cb) {
      self.log.debug(`making auth request to stash handler for ${self.description()}`);

      // response
      //  - auth: To be used as the value of the Authorization header
      //  - url: Full request URL (provider host + path in the lookup request)
      self.getAuthorization(function(err, response) {
        if (err) {
          self.log.error({err, project: self.project}, `Failed to get Stash credentials: ${err.message}`);

          // write the error to the process stdout
          self.setScript([
            `echo "Failed to get Stash credentials: ${err.message}"`,
          ]);
        }
        else {
          self.log.debug(`auth request to stash handler success for ${self.description()}`);

          self.params.auth = response.auth;
          self.params.url = response.url;

          // build the shell script now that we have all the auth/request info
          self.setStashScript();

          // filter out secret strings (the full auth header)
          self.options.secrets = [
            response.auth,
          ];
        }

        return run(cb);
      });
    });
  }

  /**
   * Makes an API call to the Stash handler to generate OAuth credentials.
   *
   * @param {function} callback - The callback function to call upon completion.
   */
  getAuthorization(callback) {
    var params = this.params;

    request(this.options.auth_lookup_url, {
      qs: {
        type: 'stash',
        url: `${params.providerUrl}/plugins/servlet/archive/projects/${params.owner}/repos/${params.repo}?at=${params.ref}&format=${params.format}`,
        token: params.token,
        tokenSecret: params.tokenSecret,
      },
      // Parse response as JSON
      json: true,
    }, function(err, res, body) {
      callback(err, body);
    });
  }

  setStashScript() {
    let params = this.params;
    let build = this.build;
    // Stash is self hosted and invariably some organizations will use
    // self-signed certificates. This is a semi-valid use case. Ideally
    // these clients would just get a letsencrypt certificate but some
    // IT orgs don't trust them yet. This feature lets those orgs
    // specify that we should not try to validate the cert chain.
    let insecureFlag = build.config.insecureStashDownload ? '--no-check-certificate' : '';
    let script = [
      'mkdir -p $SRC_DIR',
      'cd $SRC_DIR',
      `wget -q -O - ${insecureFlag} --header 'Authorization:${params.auth}' "${params.url}" | tar xzf - `,
    ];

    if (!!build.config.removeCachedSourceCode)
      script.unshift('rm -rf $SRC_DIR')

    this.setScript(script);
  }

  description() {
    return `${this.plugin} ${this.params.owner}/${this.params.repo} @ ${this.params.ref}`;
  }
};
