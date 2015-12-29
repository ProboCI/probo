'use strict';
var LAMPApp = require('../../lib/plugins/TaskRunner/LAMPApp');
var os = require('os');

var mockContainer = {
  log: {child: function() {}},
  containerConfig: {
    build: {
      links: {
        build: 'http://abc123.probo.build',
      },
    },
  },
};

describe('LAMP App', function() {

  var options = {
    database: 'my-cool-db.sql',
    databaseName: 'my-cool-db',
  };
  var app = new LAMPApp(mockContainer, options);

  var optionsGZ = {
      database: 'my-cool-db.sql',
      databaseName: 'my-cool-db',
      databaseGzipped: true,
    };
  var appGZ = new LAMPApp(mockContainer, optionsGZ);

  it('builds proper lamp script', function() {

    app.script.should.containEql('mkdir -p $SRC_DIR; cd $SRC_DIR');

    app.script.should.containEql('if [ -d "$SRC_DIR/docroot" ]');
    app.script.should.containEql('if [ -a "$SRC_DIR/index.php" ]');
    app.script.should.containEql('ln -s $SRC_DIR  /var/www/html');

    app.script.should.containEql('mysql -e \'create database my-cool-db\'');

    app.script.should.containEql(
      'cat $ASSET_DIR/my-cool-db.sql | `drush --root=/var/www/html sql-connect`'
    );

  });

  it('handles gzipped databases', function() {
    appGZ.script.should.containEql('gunzip -c');
  });
});