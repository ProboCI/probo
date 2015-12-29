'use strict';
var WordpressApp = require('../../lib/plugins/TaskRunner/Wordpress');

var mockContainer = {
  log: {child: function() {}},
};

describe('Wordpress App', function() {

  var options = {
    database: 'my-cool-db.sql',
  };
  var app = new WordpressApp(mockContainer, options);

  var options2 = {
      database: 'my-cool-db.sql',
      databaseGzipped: true,
      flushCaches: false,
    };
  var app2 = new WordpressApp(mockContainer, options2);

  it('builds proper lamp script', function() {
    console.log(app.script);
    app.script.should.containEql('mkdir -p $SRC_DIR; cd $SRC_DIR');

    app.script.should.containEql('if [ -d "$SRC_DIR/docroot" ]');
    app.script.should.containEql('if [ -a "$SRC_DIR/index.php" ]');
    app.script.should.containEql('ln -s $SRC_DIR  /var/www/html');

    app.script.should.containEql('mysql -e \'create database wordpress\'');

  });

  it('handles gzipped databases', function() {
    app2.script.should.containEql('gunzip -c');
  });

  it('cats the wp-config.php file', function() {
    app.script.should.containEql("define(\"DB_USER\", \"strongpassword\");");
  });

  it('flushes the cache', function() {
    app.script.should.containEql("wp cache flush");
    app2.script.should.not.containEql("wp cache flush");
  });
});