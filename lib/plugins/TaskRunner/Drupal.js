"use strict"
var Promise = require('bluebird')
var through2 = require('through2')

module.exports = class Drupal extends require('./Script') {

  /**
   * Options (used by this task):
   *   - siteFolder: (string) The site folder to use for this build (the folder within the drupal `sites` folder.  Defaults to `default`.
   *   - database: (string) - The name of the database to be imported, must have already been uploaded and included in the `assets` key for this build.
   *   - databaseGzipped: (boolean) - Whether the database was sent gzipped and whether it should therefore be gunzipped before importing.
   *   - databaseUpdates: (boolean) - Determines whether to run `drush updb`
   *   - revertFeatures: (boolean) - Whether to revert features
   *   - installProfile: (string) - If set this install (incompatible with the `database` option).
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
      'if [ -d "$SRC_DIR/' + this.options.subDirectory + '" ] ; then',
      '  echo \'Docroot found within code directory, creating symlink.\'',
      '  ln -s "$SRC_DIR/docroot" /var/www/html',
      'fi',
      'if [ -a "$SRC_DIR/index.php" ] ; then',
      '  echo \'Index.php found within the root of the codebase, creating symlink.\'',
      '  ln -s $SRC_DIR  /var/www/html',
      'else',
      '  echo "This directory does not appear to be valid',
      '  exit 1',
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
      '  echo \'<?php\' > /var/www/html/sites/default/settings.php',
      'fi',
      'echo "$PHP_SNIPPET" >> /var/www/html/sites/default/settings.php',
      'mkdir -p /var/www/html/sites/default/files',
      'chown www-data:www-data -R /var/www/html/sites/default/files',
    ]

    if (options.database) {
      var databaseImportBase = ''
      if (options.databaseGzipped) {
        databaseImportBase = 'gunzip -c '
      }
      else {
        databaseImportBase = 'cat '
      }
      script.push(databaseImportBase + ' $ASSET_DIR/' + options.database + ' | `drush --root=/var/www/html sql-connect`')
      script.push('rm $ASSET_DIR/' + options.database)
    }

    if (options.databaseUpdates) {
      script.push('drush --root=/var/www/html updb')
    }

    if (options.revertFeatures) {
      script.push('drush --root=/var/www/html fra')
    }

    this.setScript(script)

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
