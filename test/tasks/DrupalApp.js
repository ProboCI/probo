'use strict';
var DrupalApp = require('../../lib/plugins/TaskRunner/Drupal');

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
    databaseName: 'cooldb',
    databasePrefix: 'prefix',
    alias: 'site1.com',
    aliasSubdomain: 'siteone',
  };
  var app2 = new DrupalApp(mockContainer, options2);

  it('builds proper lamp script', function() {

    app.script.should.containEql('mkdir -p $SRC_DIR; cd $SRC_DIR');

    app.script.should.containEql('if [ -d "$SRC_DIR/docroot" ]');
    app.script.should.containEql('if [ -a "$SRC_DIR/index.php" ]');
    app.script.should.containEql('ln -s $SRC_DIR  /var/www/html');

    app.script.should.containEql('mysql -e \'create database drupal\'');
    app2.script.should.containEql('mysql -e \'create database cooldb\'');

    app.script.should.containEql(
      'cat $ASSET_DIR/my-cool-db.sql | $(mysql -u root --password=strongpassword drupal)'
    );

  });

  it('handles gzipped databases', function() {
    app2.script.should.containEql('gunzip -c');
  });

  it('cats the settings.php file', function() {
    app.script.should.containEql('\'database\' => \'drupal\'');
    app2.script.should.containEql('\'database\' => \'cooldb\'');
    app.script.should.containEql('\'username\' => \'root\'');
    app.script.should.containEql('\'password\' => \'strongpassword\'');
  });

  it('clears the cache', function() {
    app.script.should.containEql('drush --root=/var/www/html cache-clear all');
    app2.script.should.not.containEql('drush --root=/var/www/html cache-clear all');
  });

  it('handles multisite configuration', function() {
    app2.script.should.containEql("$sites[http://siteone.abc123.probo.build] = site1.com;");
    app2.script.should.containEql("$config['database_prefix'] = 'prefix';");
  });
});
