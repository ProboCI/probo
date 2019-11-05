'use strict';

const DEFAULT_BASE_URL = 'https://gitlab.com';

module.exports = class GitlabDownloader extends require('./Script') {

  /**
   * @param {object} container - The dockerode docker container object.
   * @param {object} options - Options used by this task.
   * @param {object} options.build - Build object, properties used:
   *      - ref (refspec of the commit)
   * @param {object} options.project - Project object, properties used:
   *      - provider.type: Must be "gitlab", otherwise throws an error
   *      - slug: Repository slug
   *      - service_auth.token: Auth token (OAuth for Gitlab)
   *   - ref: can be used to override build.ref (for example to pull down merged PR commit)
   */
  constructor(container, options) {
    super(container, options);

    var build = options.build;
    var project = options.project;

    if (project.provider.type !== 'gitlab') {
      throw new Error('Unsupported provider type: ' + project.provider.type);
    }

    this.params = {
      auth_token: project.service_auth.token,
      base_url: project.provider.baseUrl || DEFAULT_BASE_URL,
      repo_slug: project.provider_id,
      ref: options.ref || build.commit.ref,
    };

    this.setGitlabScript();

    // filter out secret strings
    options.secrets = [
      this.params.auth_token,
    ];
  }

  setGitlabScript() {
    var params = this.params;

    var script = [
      'mkdir -p $SRC_DIR',
      'cd $SRC_DIR',
      `curl --header "Authorization: Bearer ${params.auth_token}" ${params.base_url}/api/v4/projects/${params.repo_slug}/repository/archive?sha=${params.ref} | tar xzf - --strip-components=1`,
    ];
 
    this.setScript(script);
  }

  description() {
    return `${this.plugin} ${this.params.repo_slug} @ ${this.params.ref}`;
  }
};
