'use strict';

var Promise = require('bluebird');
var request = require('request');

module.exports = class BitbucketDownloader extends require('./Script') {

  /**
   * @param {object} container - The dockerode docker container object.
   * @param {object} options - Options used by this task.
   * @param {object} options.build - build object, properties used:
   *      - ref (refspec of the commit)
   *      - config.removeCachedSourceCode: whether or not to delete cached source
   * @param {object} options.project - project object, properties used:
   *      - provider.type: Must be "Bitbucket", otherwise throws an error
   *      - provider.slug: Provider identifier
   *      - provider.owner: Repository owner (bitbucket project or owner slug)
   *      - provider.repo: Repository slug (just the repo name)
   *      - service_auth.token: OAuth1.0 token
   *      - service_auth.tokenSecret: OAuth1.0 token secret
   *   - ref: can be used to override build.ref (for example to pull down merged PR commit)
   *   - auth_lookup_url: bitbucket handler URL for authorization requests, including protocol
   */
  constructor(container, options) {
    super(container, options);

    var build = this.build = options.build;
    var project = this.project = options.project;

    if (project.provider.type !== 'bitbucket') {
      throw new Error('Unsupported provider type: ' + project.provider.type);
    }

    this.params = {
      provider_slug: project.provider.slug,
      owner: project.owner,
      repo: project.repo,
      token: project.service_auth.token,
      refreshToken: project.service_auth.refreshToken,
      auth_lookup_url: options.auth_lookup_url,
      ref: options.ref || build.commit.ref,
      format: 'tar.gz',
    };
    // delay run function until we've done an async action

    var run = this.run;
    var self = this;

    /**
     * Overrides AbstractPlugin::run to lookup OAuth1.0 credentials before running actual task.
     */
    this.run = Promise.promisify(function(cb) {
      self.log.debug(`making auth request to bitbucket handler for ${self.description()}`);

      // response
      //  - auth: To be used as the value of the Authorization header
      //  - url: Full request URL (provider host + path in the lookup request)
      self.getNewToken(function(err) {
        if (err) {
          self.log.error({err, project: self.project}, `Failed to get Bitbucket credentials: ${err.message}`);

          // write the error to the process stdout
          self.setScript([
            `echo "Failed to get Bitbucket credentials: ${err.message}"`,
          ]);

          return cb(err);
        }
        else {
          self.log.debug(`auth request to bitbucket handler success for ${self.description()}`);

          // build the shell script now that we have all the auth/request info
          self.setBitbucketScript();

          // filter out secret strings (the full auth header)
          self.options.secrets = [
            self.params.token,
          ];
        }

        return run(cb);
      });
    });
  }

  setBitbucketScript() {
    var params = this.params;
    var auth = `--header 'Authorization:Bearer ${params.token}'`;
    var url = `https://bitbucket.org/${params.owner}/${params.repo}/get/${params.ref}.${params.format}`;

    var script = [
      'mkdir -p $SRC_DIR',
      'cd $SRC_DIR',
      `wget -q -O - ${auth} "${url}" | tar xzf - --strip-components=1`,
    ];

    if (!!build.config.removeCachedSourceCode)
      script.unshift('rm -rf $SRC_DIR')

    this.setScript(script);
  }

  description() {
    return `${this.plugin} ${this.params.owner}/${this.params.repo} @ ${this.params.ref}`;
  }

  getNewToken(done) {
    var self = this;

    var url = self.params.auth_lookup_url;
    var auth = {
      url: url,
      qs: {
        type: 'bitbucket',
        refreshToken: self.project.service_auth.refreshToken,
      },
      json: true,
    };

    request.get(auth, function(error, response, body) {
      if (error) return done(error);

      self.params.token = body.access_token;
      done();
    });
  }
};
