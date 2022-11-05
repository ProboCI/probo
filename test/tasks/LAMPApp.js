'use strict';

require('should');

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
      'cli': {
        memory_limit: '256M',
      },
      'apache2': {
        'soap.wsdl_cache_dir': '/tmp',
      },
      'all': {
        post_max_size: '20M',
      },
    },
    mysqlCnfOptions: {
      innodb_large_prefix: true,
      innodb_file_format: 'barracuda',
      innodb_file_per_table: true,
    },
    apacheMods: ['dir', 'my-cool-apachemod'],
    phpMods: ['mcrypt', 'my-cool-php5mod'],
    installPackages: ['php5-mcrypt', 'my-cool-package'],
    phpConstants: {PI: 3.14, FUZZY_PI: '3.14ish'},
    varnish: {enable: true},
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

  it('builds proper LAMP script', function() {

    app.script.should.containEql('mkdir -p $SRC_DIR; cd $SRC_DIR');

    app.script.should.containEql('if [ -d "$SRC_DIR/docroot" ]');
    app.script.should.containEql('if [ -a "$SRC_DIR/index.php" ]');
    app.script.should.containEql('ln -s $SRC_DIR  /var/www/html');

    app.script.should.containEql('mysql -e \'create database \'$DATABASE_NAME');

    app.script.should.containEql(
      'cat $ASSET_DIR/my-cool-db.sql | $(mysql -u $DATABASE_USER --password=$DATABASE_PASS $DATABASE_NAME)'
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

  it('exports an variable for apache config directory', function() {
    app.script.should.containEql('PHPINI_PATH="$(php -i | grep php.ini | head -1 | sed \'s/\\/cli//g\' | sed \'s/.* //g\')"');
  });

  it('handles custom php options', function() {
    app.script.should.containEql('echo "opcache.max_file_size=0" >> $PHPINI_PATH/apache2/conf.d/99-probo-settings.ini\n');
    app.script.should.containEql('echo "opcache.optimization_level=4294967295" >> $PHPINI_PATH/apache2/conf.d/99-probo-settings.ini\n');
    app.script.should.containEql('echo "opcache.optimization_level=4294967295" >> $PHPINI_PATH/cli/conf.d/99-probo-settings.ini\n');
    app.script.should.containEql('echo "soap.wsdl_cache_dir=\'/tmp\'" >> $PHPINI_PATH/apache2/conf.d/99-probo-settings.ini\n');
    app.script.should.containEql('echo "memory_limit=\'256M\'" >> $PHPINI_PATH/cli/conf.d/99-probo-settings.ini\n');
    app.script.should.containEql('echo "post_max_size=\'20M\'" >> $PHPINI_PATH/cli/conf.d/99-probo-settings.ini\n');
    app.script.should.containEql('echo "post_max_size=\'20M\'" >> $PHPINI_PATH/apache2/conf.d/99-probo-settings.ini\n');
    app.script.should.not.containEql('echo "memory_limit=\'256M\'" >> $PHPINI_PATH/apache2/conf.d/99-probo-settings.ini\n');
  });

  it('handles custom mysql options', function() {
    app.script.should.containEql('echo "[mysqld]" >> /etc/mysql/probo-settings.cnf');
    app.script.should.containEql('echo "innodb_large_prefix=true" >> /etc/mysql/probo-settings.cnf\n');
    app.script.should.containEql('echo "innodb_file_format=\'barracuda\'" >> /etc/mysql/probo-settings.cnf\n');
    app.script.should.containEql('echo "innodb_file_per_table=true" >> /etc/mysql/probo-settings.cnf\n');
  });

  it('handles custom php defines', function() {
    app.script.should.containEql('echo "auto_prepend_file=\'$SRC_DIR/.proboPhpConstants.php\'" >> $PHPINI_PATH/apache2/conf.d/99-probo-settings.ini\n');
    app.script.should.containEql('echo "<?php define (\'PI\', 3.14); define (\'FUZZY_PI\', \'3.14ish\'); " > $SRC_DIR/.proboPhpConstants.php');
  });

  it('handles custom php mods', function() {
    app.script.should.containEql('php5enmod mcrypt');
    app.script.should.containEql('php5enmod my-cool-php5mod');
  });

  it('handles custom apache mods', function() {
    app.script.should.containEql('a2enmod dir');
    app.script.should.containEql('a2enmod my-cool-apachemod');
  });

  it('enables varnish vhost', function() {
    app.script.should.containEql('a2enconf listen_8080');
    app.script.should.containEql('a2dissite 000-default.conf');
    app.script.should.containEql('a2ensite 000-default-varnish.conf');
    app.script.should.containEql('service varnish restart');

    appGZ.script.should.not.containEql('a2enconf listen_8080');
    appGZ.script.should.not.containEql('a2dissite 000-default.conf');
    appGZ.script.should.not.containEql('a2ensite 000-default-varnish.conf');
    appGZ.script.should.not.containEql('service varnish restart');
  });

  it('automatically restarts apache', function() {
    // we didn't explicitly set the reset command, it should be added via the other options
    app.script.should.containEql('apache2ctl graceful');
    appGZ.script.should.not.containEql('apache2ctl graceful');

  });

  it('sanitizes strings for the command line and wraps them in single-quotes', function() {
    var s = app.sanitizeValue('hi\'"');
    s.should.equal('\'hi\\\'\\"\'');
  });

  it('should have default values for any options that are output as strings', function(done) {
    app.script.should.not.containEql('undefined');
    done();
  });
});
