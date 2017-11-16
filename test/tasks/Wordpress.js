'use strict';
var WordPressApp = require('../../lib/plugins/TaskRunner/WordPressApp');
var constants = require('../../lib/plugins/TaskRunner/constants');

var mockContainer = {
  log: {child: function() {}},
  build: {
    links: {
      build: 'http://abc123.probo.build',
    },
  },
};

/* eslint-disable no-unused-expressions */

describe('WordPress plugin', function() {
  var options;
  var app;
  var options2;
  var app2;

  before(function(done) {
    options = {
      database: 'my-cool-db.sql',
      wpDomain: 'http://example.com',
      wpHome: 'http://example.com/home',
    };

    options2 = {
      database: 'my-cool-db.sql',
      wpDomain: 'http://example2.com',
      wpHome: 'http://example.com/home',
      updatePlugins: true,
      databaseGzipped: true,
      flushCaches: false,
    };

    done();
  });

  beforeEach(function(done) {
    app = new WordPressApp(mockContainer, options);
    app.should.be.ok;
    app.should.have.property('id').which.is.a.String;
    app.id.should.match(/[0-9a-z]{16}/g);

    app2 = new WordPressApp(mockContainer, options2);
    app2.should.be.ok;
    app2.should.have.property('id').which.is.a.String;
    app2.id.should.match(/[0-9a-z]{16}/g);

    done();
  });

  it('should correctly instantiate', function(done) {
    var appDescription = app.description();
    appDescription.should.be.a.String.which.eql('WordPressApp \'Provisioning WordPress!\'');

    app.should.have.property('databaseName').which.eql(constants.WORDPRESS_DATABASE_NAME);
    app.should.have.property('options').which.is.a.Object;
    app.options.should.have.property('siteFolder').which.eql('default');
    app.options.should.have.property('profileName').which.eql('standard');
    app.options.should.have.property('flushCaches').which.eql(true);
    app.options.should.have.property('wpHome').which.eql(options.wpHome);
    app.options.should.have.property('wpDomain').which.eql(options.wpDomain);
    app.options.should.have.property('updatePlugins').which.eql(false);
    app.options.should.have.property('secrets').which.is.a.Array;
    app.options.secrets.should.have.length(0);
    app.should.have.property('subDirectory').which.eql('docroot');
    app.should.have.property('script').which.is.a.String;

    done();
  });

  it('should correctly build a command to replace WP options', function(done) {
    var replaceCommand = app.replaceOption('old', 'new');
    replaceCommand.should.be.a.String.which.eql('cd /var/www/html/ ; wp option update old new --allow-root');

    done();
  });

  it('should correctly build a command to search and replace database text', function(done) {
    var replaceCommand = app.replaceTextDb('old', 'new');
    replaceCommand.should.be.a.String.which.eql('cd /var/www/html/ ; wp search-replace \'old\' \'new\' --skip-columns=guid --allow-root');

    done();
  });

  it('should correctly build up the script', function(done) {
    app.script = [];
    app.addScriptAppendWPConfigSettings();
    app.script.should.have.length(10);
    app.script.should.eql([
      'if [ ! -a "/var/www/html/wp-config.php" ] ; then',
      '  echo "<?php\ndefine(\'DB_NAME\', \'database_name_here\');\ndefine(\'DB_USER\', \'username_here\');\ndefine(\'DB_PASSWORD\', \'password_here\');\ndefine(\'DB_HOST\', \'localhost\');\ndefine(\'DB_CHARSET\', \'utf8\');\ndefine(\'DB_COLLATE\', \'\');\ndefine(\'AUTH_KEY\',         \'put your unique phrase here\');\ndefine(\'SECURE_AUTH_KEY\',  \'put your unique phrase here\');\ndefine(\'LOGGED_IN_KEY\',    \'put your unique phrase here\');\ndefine(\'NONCE_KEY\',        \'put your unique phrase here\');\ndefine(\'AUTH_SALT\',        \'put your unique phrase here\');\ndefine(\'SECURE_AUTH_SALT\', \'put your unique phrase here\');\ndefine(\'LOGGED_IN_SALT\',   \'put your unique phrase here\');\ndefine(\'NONCE_SALT\',       \'put your unique phrase here\');\n\\$table_prefix = \'wp_\';\ndefine(\'WP_DEBUG\', false);\nif ( !defined(\'ABSPATH\') )\n\tdefine(\'ABSPATH\', dirname(__FILE__) . \'/\');\nrequire_once(ABSPATH . \'wp-settings.php\');\n" > /var/www/html/wp-config.php',
      'fi',
      'sed -i "1i <?php require(\'probo-config.php\'); ?>" /var/www/html/wp-config.php',
      'echo "<?php',
      'define(\'DB_NAME\', \'wordpress\');',
      'define(\'DB_USER\', \'root\');',
      'define(\'DB_PASSWORD\', \'strongpassword\');',
      'define(\'DB_HOST\', \'localhost\');',
      '?>" >> /var/www/html/probo-config.php;',
    ]);

    app.script = [];
    app.addScriptUpdatePlugins();
    app.script.should.have.length(1);
    app.script.should.eql(['cd /var/www/html/ ; wp plugin update --all --allow-root']);

    app.script = [];
    app.addScriptFlushCaches();
    app.script.should.have.length(1);
    app.script.should.eql(['cd /var/www/html/ ; wp cache flush --allow-root']);

    app.script = [];
    app.addScriptFixFilePerms();
    app.script.should.have.length(3);
    app.script.should.eql([
      'mkdir -p /var/www/html/wp-content/uploads',
      'chown www-data:www-data /var/www/html/wp-content/uploads',
      'chmod 755 /var/www/html/wp-content/uploads',
    ]);

    app.script = [];
    app.addScriptReplaceDomain();
    app.script.should.have.length(6);
    app.script.should.eql([
      'cd /var/www/html/ ; wp option update home $BUILD_DOMAIN --allow-root',
      'cd /var/www/html/ ; wp option update siteurl $BUILD_DOMAIN --allow-root',
      'export WP_HOME=http://example.com/home',
      'cd /var/www/html/ ; wp search-replace \'$WP_HOME\' \'$BUILD_DOMAIN\' --skip-columns=guid --allow-root',
      'export WP_DOMAIN=http://example.com',
      'cd /var/www/html/ ; wp search-replace \'$WP_DOMAIN\' \'$BUILD_DOMAIN\' --skip-columns=guid --allow-root',
    ]);

    app.script = [];
    app.populateScriptArray();
    app.script.should.have.length(35);

    done();
  });

  it('builds proper lamp script', function(done) {
    app.script.should.containEql('mkdir -p $SRC_DIR; cd $SRC_DIR');
    app.script.should.containEql('if [ -d "$SRC_DIR/docroot" ]');
    app.script.should.containEql('if [ -a "$SRC_DIR/index.php" ]');
    app.script.should.containEql('ln -s $SRC_DIR  /var/www/html');
    app.script.should.containEql(`mysql -e 'create database ${constants.WORDPRESS_DATABASE_NAME}'`);

    done();
  });

  it('handles gzipped databases', function(done) {
    app2.script.should.containEql('gunzip -c');

    done();
  });

  it('inserts the snippet into wp-config.php', function(done) {
    app.script.should.containEql('sed -i "1i <?php require(\'probo-config.php\'); ?>" /var/www/html/wp-config.php');
    app.script.should.containEql(`define('DB_PASSWORD', '${constants.DATABASE_PASSWORD}');`);

    done();
  });

  it('switches to the probo domain', function(done) {
    app.script.should.containEql('export WP_HOME=http://example.com/home');
    app.script.should.containEql('export WP_DOMAIN=http://example.com');
    app.script.should.containEql('wp option update home $BUILD_DOMAIN');
    app.script.should.containEql('wp search-replace \'$WP_HOME\' \'$BUILD_DOMAIN\'');
    app.script.should.containEql('wp option update siteurl $BUILD_DOMAIN');
    app.script.should.containEql('wp search-replace \'$WP_DOMAIN\' \'$BUILD_DOMAIN\'');

    done();
  });

  it('flushes the cache', function(done) {
    app.script.should.containEql('wp cache flush');
    app2.script.should.not.containEql('wp cache flush');
    done();
  });

  it('should have default values for any options that are output as strings', function(done) {
    app.script.should.not.containEql('undefined');
    app2.script.should.not.containEql('undefined');
    done();
  });
});
