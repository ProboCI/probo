'use strict';
// NOTE: run this test independently as
// npm test test/lib/container.js

var sinon = require('sinon');
var should = require('should');
var Resolver = require('multiple-callback-resolver');

var Container = require('../../lib/Container');

describe('Container', function() {
  describe('events', function() {
    it('fires a generic stateChange event', function(done) {
      var container = new Container({});

      var resolver = new Resolver({nonError: true});

      var history = [];
      resolver.resolve(function(error, results) {
        should.not.exist(error);
        Object.keys(results).length.should.equal(3);
        history[0][0].should.equal('stopping');
        history[1][0].should.equal('stopped');
        done();
      });
      container.once('stopping', resolver.createCallback('stopping'));
      container.once('stopped', resolver.createCallback('stopped'));
      container.on('stateChange', function() {
        history.push(arguments);
      });

      // stub out stop method on internal container
      container.dockerContainer = {stop: function(done) { done(); }};

      container.stop(resolver.createCallback('finished'));
    });
  });

  describe('stats', function() {
    var container;

    it('disk usage', function(done) {
      container = new Container({containerId: 'blah'});

      // mock out dockerode's container.modem.dial call,
      // to make sure our 'inspect' patch is working correctly
      // (and as are future dockerode versions)
      sinon.stub(container.dockerContainer.modem, 'dial', function(opts, cb) {
        opts.should.containEql({
          method: 'GET',
          options: {size: true},
          path: '/containers/blah/json?',
        });
        cb(null, require('../fixtures/container_inspect.json'));
      });

      container.getDiskUsage(function(err, disk) {
        should.not.exist(err);
        disk.should.eql({
          containerSize: 5257740,
          imageSize: 1113815794,
        });

        done();
      });
    });
  });
});
