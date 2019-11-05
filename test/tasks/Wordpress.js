'use strict';

require('should');

var WordPressApp = require('../../lib/plugins/TaskRunner/WordPressApp');

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
      databasePrefix: 'coool_',
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
    appDescription.should.equal('WordPressApp \'Provisioning WordPress!\'');

    app.should.have.property('databaseName').which.equal('wordpress');
    app.should.have.property('options').which.is.a.Object();
    app.options.should.have.property('siteFolder').which.equal('default');
    app.options.should.have.property('profileName').which.equal('standard');
    app.options.should.have.property('flushCaches').which.equal(true);
    app.options.should.have.property('wpHome').which.equal(options.wpHome);
    app.options.should.have.property('wpDomain').which.equal(options.wpDomain);
    app.options.should.have.property('updatePlugins').which.equal(false);
    app.options.should.have.property('secrets').which.is.a.Array();
    app.options.secrets.should.have.length(0);
    app.should.have.property('subDirectory').which.equal('docroot');
    app.should.have.property('script').which.is.a.String();

    done();
  });

  it('should correctly build a command to replace WP options', function(done) {
    var replaceCommand = app.replaceOption('old', 'new');
    replaceCommand.should.equal('cd /var/www/html/ ; wp option update old new --allow-root');

    done();
  });

  it('should correctly build a command to search and replace database text', function(done) {
    var replaceCommand = app.replaceTextDb('old', 'new');
    replaceCommand.should.equal('cd /var/www/html/ ; wp search-replace \'old\' \'new\' --skip-columns=guid --allow-root');

    done();
  });

  it('should prefix the database as needed', function(done) {
    app.script.should.containEql('\\$table_prefix = \'wp_\'');
    app2.script.should.containEql('\\$table_prefix = \'coool_\'');
    done();
  });

  it('should correctly build up the script', function(done) {
    app.script = [];
    app.addScriptAppendWPConfigSettings();

    // Only test that the boilerplate and overrides are added, not that they're
    // correct; this is tested later.
    app.script[2].should.containEql('sed -i "1idefine(\'DB_NAME');
    app.script[7].should.containEql('echo "<?php\ndefine(\'DB_NAME');

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

    done();
  });

  it('builds proper LAMP script', function(done) {
    app.script.should.containEql('mkdir -p $SRC_DIR; cd $SRC_DIR');
    app.script.should.containEql('if [ -d "$SRC_DIR/docroot" ]');
    app.script.should.containEql('if [ -a "$SRC_DIR/index.php" ]');
    app.script.should.containEql('ln -s $SRC_DIR  /var/www/html');
    app.script.should.containEql('mysql -e \'create database \'$DATABASE_NAME');

    done();
  });

  it('handles gzipped databases', function(done) {
    app2.script.should.containEql('gunzip -c');

    done();
  });

  it('inserts the settings into wp-config for builds without wp-config in repo', function(done) {
    var boilerplate = app.wordpressConfigBoilerplate();
    var boilerplateWithDbPrefix = app2.wordpressConfigBoilerplate();

    app.script.should.containEql(`echo "${boilerplate}" > /var/www/html/wp-config.php`);

    // Boilerplate tests
    boilerplate.should.containEql('define(\'DB_NAME\', \'$DATABASE_NAME\')');
    boilerplate.should.containEql('define(\'DB_USER\', \'$DATABASE_USER\'');
    boilerplate.should.containEql('define(\'DB_PASSWORD\', \'$DATABASE_PASS\'');
    boilerplate.should.containEql('define(\'DB_HOST\', \'localhost\')');
    boilerplate.should.containEql('define(\'DB_CHARSET\', \'utf8\')');
    boilerplate.should.containEql('define(\'DB_COLLATE\', \'\')');
    boilerplate.should.containEql('define(\'AUTH_KEY\',         \'put your unique phrase here\')');
    boilerplate.should.containEql('define(\'SECURE_AUTH_KEY\',  \'put your unique phrase here\')');
    boilerplate.should.containEql('define(\'LOGGED_IN_KEY\',    \'put your unique phrase here\')');
    boilerplate.should.containEql('define(\'NONCE_KEY\',        \'put your unique phrase here\')');
    boilerplate.should.containEql('define(\'WP_DEBUG\', false)');
    boilerplate.should.containEql('define(\'WP_DEBUG\', false)');
    boilerplate.should.containEql('require_once(ABSPATH . \'wp-settings.php\'');
    boilerplate.should.containEql('\\$table_prefix = \'wp_\';');

    boilerplateWithDbPrefix.should.containEql('\\$table_prefix = \'coool_\'');

    done();
  });

  it('should override wp-config settings for builds with wp-config in repo', function(done) {
    var override = app.wordpressConfigOverride();
    var overrideWithDbPrefix = app2.wordpressConfigOverride();

    app.script.should.containEql(`sed -i "1i${override}" /var/www/html/wp-config.php`);
    app.script.should.containEql(`sed -i "$(echo $WP_CONFIG_WPSETTINGS_LINE_NUMBER)i\\$table_prefix = '${app.options.databasePrefix}';" /var/www/html/wp-config.php`);

    override.should.containEql('define(\'DB_NAME\', \'$DATABASE_NAME\')');
    override.should.containEql('define(\'DB_USER\', \'$DATABASE_USER\'');
    override.should.containEql('define(\'DB_PASSWORD\', \'$DATABASE_PASS\'');
    override.should.containEql('define(\'DB_HOST\', \'localhost\')');

    overrideWithDbPrefix.should.containEql('\\$table_prefix = \'coool_\'');

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
