'use strict';

/**
 * Lighthouse plugin runs https://www.npmjs.com/package/lighthouse on paths of your build.
 */
var Script = require('./Script');

module.exports = class Lighthouse extends Script {

  /**
   * Options (used by this task):
   *
   * @param {object} container - The build container.
   * @param {object} options - The configuration options.
   * @param {array} [options.paths] - Array of relative paths to test, e.g. ['/', '/about']. Defaults to ['/'].
   * @param {array} [options.categories] - Array of objects, each object has a key of the category
   *     name (performance, pwa, accessibility, best-practices, seo) and a value of the minimum
   *     score accepted. Note a full audit is always run. This influences what is displayed
   *     and allows optional lower limits for scores.
   * @param {array} [options.lighthouseOptions] - Array of options to pass to the lighthouse cli command if necessary.
   * @see https://www.npmjs.com/package/lighthouse
   */
  constructor(container, options) {

    super(container, options);

    this.paths = options.paths || ['/'];
    this.categories = options.categories || [{performance: 0}, {pwa: 0}, {accessibility: 0}, {'best-practices': 0}, {seo: 0}];

    options.lighthouseOptions = options.lighthouseOptions || [];
    this.lighthouseOptions = [
      {output: 'json'},
      {output: 'html'},
      {'chrome-flags': '--no-sandbox=true --disable-setuid-sandbox --headless'},
    ];
    // These default options can be changed with options.lighthouseOptions.
    this.lighthouseOptions = this.lighthouseOptions.concat(options.lighthouseOptions);


    this.script = [];

    this.installLighthouse();
    // run for each path
    this.paths.forEach(this.runLighthouse, this);
    this.script = this.script.concat([
      'exit 0',
    ]);
    this.setScript(this.script);
  }

  installLighthouse() {
    // Lighthouse requires Node 8 LTS (8.9) or later.

    this.script = this.script.concat([
      'echo "Installing Lighthouse"',
      'ver=$(node -v)',
      'ver="${ver:1}"',
      'if $(dpkg --compare-versions $ver "lt" "8.9"); then npm cache clean -f && npm install -g n && n stable; fi',
      'npm install -g lighthouse',
      // Install jq for parsing json.
      'apt-get install jq -y',
    ]);
  }

  runLighthouse(path) {
    this.pathText = path.replace(/\//g, 'slash');
    this.lighthouseFlags = '--output-path="/var/www/html/lighthouse-results-' + this.pathText + '.json" ';
    this.lighthouseOptions.forEach(this.parseOptions, this);
    this.script = this.script.concat([
      // Don't be so verbose in logs that we can't even find results.
      'set +ux',
      'echo "Starting Lighthouse tests of "' + path,
      'URL=$BUILD_DOMAIN' + path,
      'mkdir -p /var/www/html',
      'lighthouse $URL ' + this.lighthouseFlags + ' &> /dev/null',
      'echo "\x1B[1;30;43mView full Lighthouse report at $BUILD_DOMAIN/lighthouse-results-' + this.pathText + '.report.html"',
    ]);
    this.categories.forEach(this.parseCategory, this);
  }

  parseOptions(value) {
    let key = Object.keys(value)[0];
    this.lighthouseFlags += '--' + key + '=\'' + value[key] + '\' ';
  }

  parseCategory(value) {
    let id = Object.keys(value)[0];
    let scoreLimit = value[id];
    this.script = this.script.concat([
      'id=' + id,
      'scoreLimit=' + scoreLimit,
      'score=$(cat /var/www/html/lighthouse-results-' + this.pathText + '.report.json | jq -r \'.categories[] | select(.id == "\'$id\'") | .score\')',
      'score=$(awk "BEGIN {print $score*100}")',
      'title=$(cat /var/www/html/lighthouse-results-' + this.pathText + '.report.json | jq -r \'.categories[] | select(.id == "\'$id\'") | .title\')',
      'echo "\x1B[1;30;43m$title: $score"',
      'pass=$(awk "BEGIN {if($score >= $scoreLimit) {print 0} else {print 1} }")',
      'if [ $pass -eq 0 ]; then echo "\x1B[1;30;42mPASS. $title score is greater than or equal to limit of $scoreLimit"; else echo "\x1B[1;30;41mFAIL. $title score is less than limit of $scoreLimit" >&2; fi',
      // Step fails.
      'if [ $pass -eq 1 ]; then exit 1; fi',
    ]);
  }

  description() {
    return 'Run Lighthouse checks';
  }
};
