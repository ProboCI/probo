'use strict';
/**
 * Posts a comment to a Jira issue based on Branch name.
 */
var Script = require('./Script');

module.exports = class Jira extends Script {
  /**
   * Options (used by this task):
   *   @param {string} [options.jiraUrl] - Full URL to Jira instance, e.g. 'https://jira.foobar.com' or 'https://foobar.atlassian.net'.
   *   @param (string) [options.jiraName] - Jira username to authenticate with.
   *   @param (string) [options.jiraPass] - Jira password to authenticate with.
   *   		- Note not recommended to pass credentials in options.
   *        - Instead, include a jira-credentials.sh assets file https://docs.probo.ci/build/assets/ which contains e.g.:
   *          #!bin/bash
   *          JIRA_URL='https://foo.com'
   *          JIRA_NAME='bar'
   *          JIRA_PASS='baz'
   *   @param (string) comment [options.comment] - Text to put in Jira comment. 
   *     May contain environment variables. Defaults to "Probo build at $BUILD_DOMAIN". 
   */
  constructor(container, options) {

    super(container, options);

    this.jiraUrl = options.jiraUrl || '';
    this.jiraName = options.jiraName || '';
    this.jiraPass = options.jiraPass || '';
    this.comment = options.comment || "Probo build at $BUILD_DOMAIN";

    this.script = [];

    this.createJiraComment();

    this.setScript(this.script);
  }

  createJiraComment() {

    this.script = this.script.concat([
      'set +ux', // Don't post variables to build logs.
      'JIRA_URL='+this.jiraUrl,
      'JIRA_NAME='+this.jiraName,
      'JIRA_PASS='+this.jiraPass,
      'BODY="'+this.comment+'"',
      'if [ -e $ASSET_DIR/jira-credentials.sh ]; then source $ASSET_DIR/jira-credentials.sh; fi',
      'echo \'{"body": "\'$BODY\'" }\'   >> jira-comment.json',
      'ISSUE=$(echo $BRANCH_NAME | awk \'{match($0,"([aA-zZ]+)-([0-9]+)")} {print substr($0,RSTART,RLENGTH)}\')',
      'curl -D- -u $JIRA_NAME:$JIRA_PASS -X POST --data @jira-comment.json -H "Content-Type: application/json" $JIRA_URL/rest/api/2/issue/$ISSUE/comment',
    ]);
  }

  description() {
    return 'Post a comment to a Jira issue';
  }
};