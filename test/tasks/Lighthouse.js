'use strict';

require('should');

var Lighthouse = require('../../lib/plugins/TaskRunner/Lighthouse');

var mockContainer = {
  log: {child: function() {}},
};

describe('Lighthouse plugin', function() {
  var options;
  var app;

  before(function(done) {
    options = {paths: ['/', 'foo', 'foo/bar']};
    done();
  });

  beforeEach(function(done) {
    app = new Lighthouse(mockContainer, options);
    app.should.be.ok();
    app.should.have.property('id').which.is.a.String();
    app.id.should.match(/[0-9a-z]{16}/g);
    done();
  });

  it('should correctly instantiate', function(done) {
    app.should.have.property('paths').which.is.a.Array();
    app.should.have.property('categories').which.is.a.Array();
    app.should.have.property('lighthouseOptions').which.is.a.Array();
    app.should.have.property('plugin').which.equal('Lighthouse');
    done();
  });

  it('should install Lighthouse library', function(done) {
    app.script.should.containEql('npm install -g lighthouse');
    done();
  });

  it('should run the lighthouse command for each path', function(done) {
    for (var i = app.paths.length - 1; i >= 0; i--) {
      app.script.should.containEql('echo "Starting Lighthouse tests of "' + app.paths[i]);
    }
    done();
  });

  it('should give a link to full report', function(done) {
    app.script.should.containEql('View full Lighthouse report');
    done();
  });

});
