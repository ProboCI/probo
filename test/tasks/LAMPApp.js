'use strict';
var LAMPApp = require('../../lib/plugins/TaskRunner/LAMPApp');
var os = require('os');

var mockContainer = {
  log: {child: function() {}},
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

    app.script.should.containEql(
      'if [ -d "$SRC_DIR/docroot" ] ; then' + os.EOL +
      '  echo \'Subdirectory docroot found within code directory, creating symlink.\'' + os.EOL +
      '  ln -s "$SRC_DIR/docroot" /var/www/html'  + os.EOL +
      'fi'  + os.EOL +
      'if [ -a "$SRC_DIR/index.php" ] ; then'  + os.EOL +
      '  echo \'Index.php found within the root of the codebase, creating symlink.\''  + os.EOL +
      '  ln -s $SRC_DIR  /var/www/html'  + os.EOL +
      'fi'
    );

    app.script.should.containEql(
      'mysql -e \'create database my-cool-db\'' + os.EOL +
       'mysql -e \'grant all on my-cool-db.* to "root"@"localhost"\'' + os.EOL +
       'mysql -e \'flush privileges\''
    );

    app.script.should.containEql(
      'cat $ASSET_DIR/my-cool-db.sql | `drush --root=/var/www/html sql-connect`'  + os.EOL +
      'rm $ASSET_DIR/my-cool-db.sql'
    );

  });

  it('handles gzipped databases', function() {

    console.log(appGZ.script);
    appGZ.script.should.containEql('gunzip -c $ASSET_DIR/my-cool-db.sql | `drush --root=/var/www/html sql-connect`' + os.EOL +
      'rm $ASSET_DIR/my-cool-db.sql');

  });
});