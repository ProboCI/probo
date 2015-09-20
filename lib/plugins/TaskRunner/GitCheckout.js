"use strict";

module.exports = class GitCheckout extends require('./Script') {
  /**
   * options (used by this task):
   *   - provider_type: "github", etc.
   *   - auth_token: Auth token (OAuth for Github)
   *   - repo_slug: Repository slug
   *   - ref: refspec of the commit
   *
   * follows process here to not write oauth token to disk:                                   
   * https://github.com/blog/1270-easier-builds-and-deployments-using-git-over-https-and-oauth
   */
  constructor(container, options) {
    super(container, options)

    if(options.provider_type != "github"){
      throw new Error("Unsupported provider type: " + options.provider_type)
    }

    if(options.provider_type == "github"){
      this.setGithubScript()
    }

    // filter out secret strings
    options.secrets = [
      options.auth_token,
    ]
  }

  setGithubScript(){
    var options = this.options

    var script = [
      "mkdir /code",
      "cd /code",
      // "git init",
      // `git pull https://${options.auth_token}@github.com/${options.repo_slug}.git +${options.ref}`,
      //`curl -L -H "Authorization:token ${options.auth_token}" https://github.com/${options.repo_slug}/tarball/${options.ref} | tar xvzf - --strip-components=1`
      `wget -q -O - --header "Authorization:token ${options.auth_token}" https://api.github.com/repos/${options.repo_slug}/tarball/${options.ref} | tar xzf - --strip-components=1`
    ]

    this.setScript(script)  // Script::setScript()
  }

  description(){
    return `${this.plugin} ${this.options.repo_slug} @ ${this.options.ref}`
  }
}
