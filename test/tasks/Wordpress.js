'use strict';
var WordpressApp = require('../../lib/plugins/TaskRunner/Wordpress');

var mockContainer = {
  log: {child: function() {}},
  build: {
    links: {
      build: 'http://abc123.probo.build',
    },
  },
};


describe('Wordpress App', function() {

  var options = {
    database: 'my-cool-db.sql',
    devDomain: 'http://example.com',
    devHome: 'http://example.com/home',
  };
  var app = new WordpressApp(mockContainer, options);

  var options2 = {
    database: 'my-cool-db.sql',
    devDomain: 'http://example.com',
    devHome: 'http://example.com/home',
    databaseGzipped: true,
    flushCaches: false,
  };
  var app2 = new WordpressApp(mockContainer, options2);

  it('builds proper lamp script', function() {
    app.script.should.containEql('mkdir -p $SRC_DIR; cd $SRC_DIR');
    app.script.should.containEql('if [ -d "$SRC_DIR/docroot" ]');
    app.script.should.containEql('if [ -a "$SRC_DIR/index.php" ]');
    app.script.should.containEql('ln -s $SRC_DIR  /var/www/html');
    app.script.should.containEql('mysql -e \'create database wordpress\'');
  });

  it('handles gzipped databases', function() {
    app2.script.should.containEql('gunzip -c');
  });

  it('inserts the snippet into wp-config.php', function() {
    app.script.should.containEql('sed -i \'$(WP_CONFIG_LINE_NUMBER)i $(PHP_SNIPPET)\' /var/www/html/wp-config.php');
    app.script.should.containEql('define(\"DB_USER\", \"strongpassword\");');
  });

  it('switches to the probo domain', function() {
    app.script.should.containEql('export DEV_HOME=http://example.com/home');
    app.script.should.containEql('export DEV_DOMAIN=http://example.com');
    app.script.should.containEql('wp option update home $BUILD_DOMAIN');
    app.script.should.containEql('wp search-replace \'$DEV_HOME\' \'$BUILD_DOMAIN\'');
    app.script.should.containEql('wp option update siteurl $BUILD_DOMAIN');
    app.script.should.containEql('wp search-replace \'$DEV_DOMAIN\' \'$BUILD_DOMAIN\'');
  });

  it('flushes the cache', function() {
    app.script.should.containEql('wp cache flush');
    app2.script.should.not.containEql('wp cache flush');
  });
});
