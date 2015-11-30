'use strict';

module.exports = class GithubDownloader extends require('./Script') {

  /**
   * Options (used by this task):
   *   - build: build object, properties used:
   *      - ref (refspec of the commit)
   *   - project: project object, properties used:
   *      - provider.type: Must be "github", otherwise throws an error
   *      - slug: Repository slug
   *      - service_auth.token: Auth token (OAuth for Github)
   *   - ref: can be used to override build.ref (for example to pull down merged PR commit)
   */
  constructor(container, options) {
    super(container, options);

    var build = options.build;
    var project = options.project;

    if (project.provider.type !== 'github') {
      throw new Error('Unsupported provider type: ' + project.provider.type);
    }

    this.params = {
      auth_token: project.service_auth.token,
      repo_slug: project.slug,
      ref: options.ref || build.ref,
    };

    this.setGithubScript();

    // filter out secret strings
    options.secrets = [
      this.params.auth_token,
    ];
  }

  setGithubScript() {
    var params = this.params;

    var script = [
      'mkdir -p $SRC_DIR',
      'cd $SRC_DIR',
      `wget -q -O - --header "Authorization:token ${params.auth_token}" https://api.github.com/repos/${params.repo_slug}/tarball/${params.ref} | tar xzf - --strip-components=1`,
    ];

    this.setScript(script);  // Script::setScript()
  }

  description() {
    return `${this.plugin} ${this.params.repo_slug} @ ${this.params.ref}`;
  }
};
