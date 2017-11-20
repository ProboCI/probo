'use strict';

/* eslint-disable no-unused-expressions */

const DrupalApp = require('../../lib/plugins/TaskRunner/Drupal');
const constants = require('../../lib/plugins/TaskRunner/constants');
const mockContainer = {
  log: {child: function() {}},
  build: {
    links: {
      build: 'http://abc123.probo.build',
    },
  },
};

describe('Drupal App', function() {
  let options;
  let options2;
  let app;
  let app2;

  before(function(done) {
    options = {
      database: 'my-cool-db.sql',
    };
    options2 = {
      database: 'my-cool-db.sql',
      databaseGzipped: true,
      clearCaches: false,
      databasePrefix: 'my_custom_prefix',
    };
    done();
  });

  beforeEach(function(done) {
    app = new DrupalApp(mockContainer, options);
    app.should.be.ok;
    app.should.have.property('id').which.is.a.String;
    app.id.should.match(/[0-9a-z]{16}/g);

    app2 = new DrupalApp(mockContainer, options2);
    app2.should.be.ok;
    app2.should.have.property('id').which.is.a.String;
    app2.id.should.match(/[0-9a-z]{16}/g);

    done();
  });

  it('should correctly instantiate', function(done) {
    app.should.have.property('databaseName').which.eql(constants.DRUPAL_DATABASE_NAME);
    app.should.have.property('options').which.is.a.Object;
    app.options.should.have.property('siteFolder').which.eql('default');
    app.options.should.have.property('profileName').which.eql('standard');
    app.should.have.property('subDirectory').which.eql('docroot');
    app.should.have.property('plugin').which.eql('Drupal');
    app.should.have.property('timeout').which.eql(6000);
    app.should.have.property('name').which.eql('Drupal task');
    app.options.should.have.property('secrets').which.is.a.Array;
    app.options.secrets.should.have.length(0);
    app.should.have.property('script').which.is.a.String;
    done();
  });

  it('gives the correct description', function(done) {
    const description = app.description();
    description.should.be.a.String.which.match('Drupal \'Provisioning Drupal!\'');
    done();
  });

  it('should correctly test supported Drupal versions', function(done) {
    let support = app.drupalVersionSupported();
    support.should.be.ok;

    const app3 = new DrupalApp(mockContainer, Object.assign({}, options, {drupalVersion: 1}));
    app3.script = [];
    app3.addScriptUnsupportedDrupalVersion();
    app3.script.should.have.length(2);
    support = app3.drupalVersionSupported();
    support.should.not.be.ok;
    done();
  });

  it('should add correct cache clearing script', function(done) {
    // testing D7 (default)
    app.script = [];
    app.addScriptClearCaches();
    app.script.should.have.length(1);
    app.script.should.eql(['drush --root=/var/www/html cache-clear all']);

    // testing D8
    const app3 = new DrupalApp(mockContainer, Object.assign({}, options, {drupalVersion: 8}));
    app3.script = [];
    app3.addScriptClearCaches();
    app3.script.should.have.length(1);
    app3.script.should.eql(['drush --root=/var/www/html cache-rebuild']);
    done();
  });

  it('should add scripts to run makefiles', function(done) {
    app.script = [];
    app.addScriptRunMakeFile();
    app.script.should.have.length(2);
    app.script.should.eql([
      'cd $SRC_DIR ; drush make undefined /var/www/html --force-complete',
      'rsync -a $SRC_DIR/ /var/www/html/profiles/standard',
    ]);
    done();
  });

  it('should add script to revert features', function(done) {
    app.script = [];
    app.addScriptRevertFeatures();
    app.script.should.have.length(1);
    app.script.should.eql(['drush --root=/var/www/html fra']);
    done();
  });

  it('should add script to run db updates', function(done) {
    app.script = [];
    app.addScriptDatabaseUpdates();
    app.script.should.have.length(1);
    app.script.should.eql(['drush --root=/var/www/html updb']);
    done();
  });

  it('should add script to run a site-install', function(done) {
    app.script = [];
    app.addScriptRunInstall();
    app.script.should.have.length(1);
    app.script.should.eql(['drush site-install --root=/var/www/html standard ']);
    done();
  });

  it('should add set the public files directory', function(done) {
    app.script = [];
    app.addScriptPublicFilesDirectory();
    app.script.should.have.length(2);
    app.script.should.eql([
      'mkdir -p /var/www/html/sites/default/files',
      'chown www-data:www-data -R /var/www/html/sites/default/files',
    ]);
    done();
  });

  it('should append custom settings to script', function(done) {
    const app3 = new DrupalApp(mockContainer, Object.assign({}, options, {settingsRequireFile: 'dummy.php', settingsAppend: 'dummy'}));
    app3.script = [];
    app3.appendCustomSettings();
    app3.script.should.have.length(2);
    app3.script.should.eql([
      'echo "require_once(\'dummy.php\');" >> /var/www/html/sites/default/settings.php',
      'echo dummy >> /var/www/html/sites/default/settings.php',
    ]);
    done();
  });

  it('should add D8 settings', function(done) {
    app.script = [];
    app.addD8PHPSettings();
    app.script.should.have.length(24);
    done();
  });

  it('should add D7 settings', function(done) {
    app.script = [];
    app.addD7PHPSettings();
    app.script.should.have.length(19);
    done();
  });


  it('should add Drupal settings and any custom settings', function(done) {
    // testing D7 (default)
    app.script = [];
    app.addScriptAppendSettingsPHPSettings();
    app.script.should.have.length(19);

    // testing D8
    const app3 = new DrupalApp(mockContainer, Object.assign({}, options, {drupalVersion: 8}));
    app3.script = [];
    app3.addScriptAppendSettingsPHPSettings();
    app3.script.should.have.length(24);
    done();
  });

  it('builds proper lamp script', function(done) {
    app.script.should.containEql('mkdir -p $SRC_DIR; cd $SRC_DIR');
    app.script.should.containEql('if [ -d "$SRC_DIR/docroot" ]');
    app.script.should.containEql('if [ -a "$SRC_DIR/index.php" ]');
    app.script.should.containEql('ln -s $SRC_DIR  /var/www/html');
    app.script.should.containEql(`mysql -e 'create database ${constants.DRUPAL_DATABASE_NAME}'`);
    app.script.should.containEql(
      `cat $ASSET_DIR/my-cool-db.sql | $(mysql -u ${constants.DATABASE_USER} --password=${constants.DATABASE_PASSWORD} ${constants.DRUPAL_DATABASE_NAME})`
    );
    done();
  });

  it('handles gzipped databases', function(done) {
    app2.script.should.containEql('gunzip -c');
    done();
  });

  it('should add a database prefix', function(done) {
    app2.script.should.containEql('my_custom_prefix');
    done();
  });

  it('cats the settings.php file', function(done) {
    app.script.should.containEql(`'database' => '${constants.DRUPAL_DATABASE_NAME}'`);
    app.script.should.containEql(`'username' => '${constants.DATABASE_USER}'`);
    app.script.should.containEql(`'password' => '${constants.DATABASE_PASSWORD}'`);
    done();
  });

  it('clears the cache', function(done) {
    app.script.should.containEql('drush --root=/var/www/html cache-clear all');
    app2.script.should.not.containEql('drush --root=/var/www/html cache-clear all');
    done();
  });

  it('should have default values for any options that are output as strings', function(done) {
    app.script.should.not.containEql('undefined');
    app2.script.should.not.containEql('undefined');
    done();
  });
});
