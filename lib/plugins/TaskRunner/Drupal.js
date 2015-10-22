"use strict"
var Promise = require('bluebird')
var through2 = require('through2')

module.exports = class Drupal extends require('./Script') {

  /**
   * Options (used by this task):
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

    // Filter out secret strings
    options.secrets = [
    ]

    var script = [
      'sleep 3',
      'if [ -d "$SRC_DIR/docroot" ] ; then',
      '  echo \'Docroot found within code directory, creating symlink.\'',
      '  ln -s "$SRC_DIR/docroot" /var/www/site',
      'fi',
      'if [ -a "$SRC_DIR/index.php" ] ; then',
      '  echo \'Index.php found within the root of the codebase, creating symlink.\'',
      '  ln -s $SRC_DIR  /var/www/site',
      'fi',
      'echo \'Creating MySQL Database, user and granting access.\'',
      'mysql -e \'create database drupal\'',
      'mysql -e \'grant all on drupal.* to "root"@"localhost"\'',
      'mysql -e \'flush privileges\'',
      'PHP_SNIPPET=$(cat <<END_HEREDOC',
      '\\$databases = array(',
      '  \'default\' => array(',
      '    \'default\' => array(',
      '      \'database\' => \'drupal\',',
      '      \'username\' => \'root\',',
      '      \'password\' => \'strongpassword\',',
      '      \'host\' => \'localhost\',',
      '      \'driver\' => \'mysql\',',
      '    ),',
      '  ),',
      ');',
      'END_HEREDOC',
      ')',
      'if [ -a "$SRC_DIR/index.php" ] ; then',
      '  echo \'<?php\' > /var/www/site/sites/default/settings.php',
      'fi',
      'echo "$PHP_SNIPPET" >> /var/www/site/sites/default/settings.php',
      'mkdir -p /var/www/site/sites/default/files',
      'chown www-data:www-data -R /var/www/site/sites/default/files',
    ]

    this.setScript(script)  // Script::setScript()

  }

  description(){
    return `${this.plugin} ${this.options.repo_slug} @ ${this.options.ref}`
  }

/*
  run(done) {
    console.log('*************** I CAN HAZ A START!!!!!  *****************')
    //this.updateStatus('LIGHT IT UP!')
    var finished = new Promise(function(resolve, reject){
      console.log('*************** I CAN HAZ A RUN!!!!!  *****************')
      resolve(data)
    })
    finished.then(function(){
      self.result.code = 0
      self.result.time = 1000

      self.updateStatus({
        state: "success",
        action: 'finished'
      })
      return {}
    })
    done();
    return  { stream: through2(), exec: finished, task: self }
  }
  */


  description(){
    return `${this.plugin} 'Provisioning Drupal!'`
  }
}
