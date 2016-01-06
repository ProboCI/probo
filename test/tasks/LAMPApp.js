'use strict';
var LAMPApp = require('../../lib/plugins/TaskRunner/LAMPApp');

var mockContainer = {
  log: {child: function() {}},
  build: {
    links: {
      build: 'http://abc123.probo.build',
    },
  },
};


describe('LAMP App', function() {

  var options = {
    database: 'my-cool-db.sql',
    databaseName: 'my-cool-db',
    cliDefines: {
      FOO: 'one\'s',
      BAR: 2,
    },
    phpIniOptions: {
      'opcache.max_file_size': 0,
      'opcache.optimization_level': 0xffffffff,
      'soap.wsdl_cache_dir': '/tmp',
    },
    apacheMods: ['dir', 'my-cool-apachemod',],
    phpMods: ['mcrypt', 'my-cool-php5mod',],
    installPackages: ['php5-mcrypt', 'my-cool-package',],
  };

  /*
  this.options.phpConstants = options.phpConstants || {};
      this.options.installPackages = options.installPackages || {};
      this.options.phpMods = options.phpMods || {};
      this.options.apacheMods = options.apacheMods || {};
      */
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
