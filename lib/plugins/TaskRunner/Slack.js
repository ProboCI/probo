'use strict';
/**
 * Posts a comment to a Slack channel.
 */
var Script = require('./Script');

module.exports = class Slack extends Script {
  /**
   * Options (used by this task):
   *   @param {string} [options.webookUrl] - Slack Webhook URL. Get one by creating a Slack app https://api.slack.com/apps/new and adding a webhook to it.
   *   		- For increased security, pass the webook URL via asset file instead.
   *        - Include a slack-credentials.sh assets file https://docs.probo.ci/build/assets/ which contains e.g.:
   *          #!bin/bash
   *          WEBHOOK_URL='https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX'
   *   @param (string) message [options.message] - Text to put in Slack message. 
   *     May contain environment variables. Defaults to "$PULL_REQUEST_NAME $PULL_REQUEST_LINK created a new Probo build at $BUILD_DOMAIN.". 
   */
  constructor(container, options) {

    super(container, options);

    this.webhookUrl = options.webhookUrl || '';
    this.message = options.message || "$PULL_REQUEST_NAME $PULL_REQUEST_LINK created a new Probo build at $BUILD_DOMAIN.";

    this.script = [];

    this.createSlackMessage();

    this.setScript(this.script);
  }

  createSlackMessage() {

    this.script = this.script.concat([
      'set +ux', // Don't post credentials to build
      'WEBHOOK_URL='+this.webhookUrl,
      'MESSAGE="'+this.message+'"',
      'MESSAGE=$(echo $MESSAGE|tr \'"\' "\'")', // Convert double quotes to single quotes in message.
      'if [ -e $ASSET_DIR/slack-credentials.sh ]; then source $ASSET_DIR/slack-credentials.sh; fi',
      'echo \'{"text": "\'$MESSAGE\'" }\'   >> slack-message.json',
      'curl -X POST --data @slack-message.json -H "Content-Type: application/json" $WEBHOOK_URL',
    ]);
  }

  description() {
    return 'Post a message to a Slack room';
  }
};