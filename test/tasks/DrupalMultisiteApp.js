'use strict';
var DrupalMultisiteApp = require('../../lib/plugins/TaskRunner/DrupalMultisite');

var mockContainer = {
  log: {child: function() {}},
  build: {
    links: {
      build: 'http://abc123.probo.build',
    },
  },
};


describe('Multisite Drupal App', function() {

  // Each site has its own database.
  var options = {
    sites: {
      'site1.com': {
        database: 'my-cool-db.sql',
        databaseName: 'cooldb',
        aliasSubdomain: 'site1',
        siteFolder: 'site1folder',
      },
      'site2.com': {
        database: 'my-lame-db.sql',
        databaseName: 'lamedb',
        aliasSubdomain: 'sitetwo',
      },
    },
    phpConstants: {
      multisite: 2,
    },

  };
  var app = new DrupalMultisiteApp(mockContainer, options);

  // Each site has a shared database with prefixes.
  var options2 = {
    sites: {
      'site1.com': {
        databasePrefix: 'cooldb_prefix',
        aliasSubdomain: 'site1',
      },
      'site2.com': {
        databasePrefix: 'lamedb_prefix',
        aliasSubdomain: 'sitetwo',
      },
    },
    database: 'my-cool-db.sql',
    databaseName: 'cooldb',
  };
  var app2 = new DrupalMultisiteApp(mockContainer, options2);

  it('adds setup commands only once', function() {
    (app.script.match(/ln \-s/g) || []).length.should.eql(2);
    (app.script.match(/proboPhpConstants/g) || []).length.should.eql(2);
  });

  it('handles multisite with multiple databases', function() {
    app.script.should.containEql('mysql -e \'create database cooldb\'');
    app.script.should.containEql('mysql -e \'create database lamedb\'');
    app.script.should.containEql('\'database\' => \'cooldb\'');
    app.script.should.containEql('\'database\' => \'lamedb\'');
    app.script.should.containEql("$sites[http://site1.abc123.probo.build] = site1.com;");
    app.script.should.containEql("$sites[http://sitetwo.abc123.probo.build] = site2.com;");
    (app.script.match(/lamedb/g) || []).length.should.eql(4);
    (app.script.match(/cooldb/g) || []).length.should.eql(4);
  });

  it('handles multisite with a single shared database', function() {
    app2.script.should.containEql('mysql -e \'create database cooldb\'');
    app2.script.should.not.containEql('mysql -e \'create database lamedb\'');
    app2.script.should.containEql("$db_prefix = 'cooldb_prefix';");
    app2.script.should.containEql("$db_prefix = 'lamedb_prefix';");

    // Only import the db once
    (app.script.match(/my-cool-db\.sql/g) || []).length.should.eql(2);
  });

  it('should not use the default site folder in multisite repos', function() {
    app.script.should.not.containEql("var/www/html/sites/default/settings.php");
  });
});
