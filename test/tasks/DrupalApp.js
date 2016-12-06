'use strict';
var DrupalApp = require('../../lib/plugins/TaskRunner/Drupal');
var constants = require('../../lib/plugins/TaskRunner/constants');


var mockContainer = {
  log: {child: function() {}},
  build: {
    links: {
      build: 'http://abc123.probo.build',
    },
  },
};


describe('Drupal App', function() {

  var options = {
    database: 'my-cool-db.sql',
  };
  var app = new DrupalApp(mockContainer, options);

  var options2 = {
    database: 'my-cool-db.sql',
    databaseGzipped: true,
    clearCaches: false,
  };
  var app2 = new DrupalApp(mockContainer, options2);

  it('builds proper lamp script', function() {

    app.script.should.containEql('mkdir -p $SRC_DIR; cd $SRC_DIR');

    app.script.should.containEql('if [ -d "$SRC_DIR/docroot" ]');
    app.script.should.containEql('if [ -a "$SRC_DIR/index.php" ]');
    app.script.should.containEql('ln -s $SRC_DIR  /var/www/html');

    app.script.should.containEql(`mysql -e 'create database ${constants.DRUPAL_DATABASE_NAME}'`);

    app.script.should.containEql(
      `cat $ASSET_DIR/my-cool-db.sql | $(mysql -u ${constants.DATABASE_USER} --password=${constants.DATABASE_PASSWORD} ${constants.DRUPAL_DATABASE_NAME})`
    );

  });

  it('handles gzipped databases', function() {
    app2.script.should.containEql('gunzip -c');
  });

  it('cats the settings.php file', function() {
    app.script.should.containEql(`'database' => '${constants.DRUPAL_DATABASE_NAME}'`);
    app.script.should.containEql(`'username' => '${constants.DATABASE_USER}'`);
    app.script.should.containEql(`'password' => '${constants.DATABASE_PASSWORD}'`);
  });

  it('clears the cache', function() {
    app.script.should.containEql('drush --root=/var/www/html cache-clear all');
    app2.script.should.not.containEql('drush --root=/var/www/html cache-clear all');
  });
});
