'use strict';
var LAMPApp = require('../../lib/plugins/TaskRunner/LAMPApp');
var constants = require('../../lib/plugins/TaskRunner/constants');

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
    apacheMods: ['dir', 'my-cool-apachemod'],
    phpMods: ['mcrypt', 'my-cool-php5mod'],
    installPackages: ['php5-mcrypt', 'my-cool-package'],
    phpConstants: {PI: 3.14, FUZZY_PI: '3.14ish'},
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
      `cat $ASSET_DIR/my-cool-db.sql | $(mysql -u ${constants.DATABASE_USER} --password=${constants.DATABASE_PASSWORD} my-cool-db)`
    );

  });

  it('handles gzipped databases', function() {
    app.script.should.not.containEql('gunzip -c');
    appGZ.script.should.containEql('gunzip -c');
  });

  it('handles custom defines', function() {
    app.script.should.containEql('export FOO=\'one\\\'s\'');
    app.script.should.containEql('export BAR=2');
  });

  it('handles install packages', function() {
    app.script.should.containEql('apt-get install -y php5-mcrypt my-cool-package');
  });

  it('handles custom php options', function() {
    app.script.should.containEql('cat /etc/php5/apache2/php.ini << EOL >> opcache.max_file_size=0');
    app.script.should.containEql('cat /etc/php5/apache2/php.ini << EOL >> opcache.optimization_level=4294967295');
    app.script.should.containEql('cat /etc/php5/apache2/php.ini << EOL >> soap.wsdl_cache_dir=\'/tmp\'');
  });

  it('handles custom php defines', function() {
    app.script.should.containEql('cat /etc/php5/apache2/php.ini << EOL >> auto_prepend_file=\'.proboPhpConstants.php\'');
    app.script.should.containEql('echo "<?php define (\'PI\', 3.14); define (\'FUZZY_PI\', \'3.14ish\'); " > $(SRC_DIR).proboPhpConstants.php');
  });

  it('handles custom php mods', function() {
    app.script.should.containEql('php5enmod mcrypt');
    app.script.should.containEql('php5enmod my-cool-php5mod');
  });

  it('handles custom apache mods', function() {
    app.script.should.containEql('a2enmod dir');
    app.script.should.containEql('a2enmod my-cool-apachemod');
  });

  it('automatically restarts apache', function() {
    // we didn't explicitly set the reset command, it should be added via the other options
    app.script.should.containEql('apache2ctl graceful');
    appGZ.script.should.not.containEql('apache2ctl graceful');

  });

  it('sanitizes strings for the command line and wraps them in single-quotes', function() {
    var s = app.sanitizeValue('hi\'\"');
    s.should.eql('\'hi\\\'\\\"\'');
  });

  it('should have default values for any options that are output as strings', function(done) {
    app.script.should.not.containEql('undefined');
    done();
  });
});
