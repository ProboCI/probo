'use strict';

/* eslint no-unused-expressions: 0 */

// NOTE: run this test independently as
// npm test test/lib/container.js

var sinon = require('sinon');
var should = require('should');

var Container = require('../../lib/Container');

describe('Container', function() {
  describe('events', function() {
    it('fires a generic stateChange event', function(done) {
      var container = new Container({});

      var event = sinon.spy();
      var stateChange = function() {
        event.called.should.be.ok;

        var args = Array.prototype.slice.call(arguments);
        args.should.eql(['stopping']);

        done();
      };

      container.on('stopping', event);
      container.on('stateChange', stateChange);

      // stub out stop method on internal container
      container.container = {stop: sinon.spy()};

      container.stop();
    });
  });

  describe('stats', function() {
    var container;

    it('disk usage', function(done) {
      container = new Container({containerId: 'blah'});

      // mock out dockerode's container.modem.dial call,
      // to make sure our 'inspect' patch is working correctly
      // (and as are future dockerode versions)
      sinon.stub(container.container.modem, 'dial')
        .callsFake(function(opts, cb) {
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
          realBytes: 5257740,
          virtualBytes: 1113815794,
        });

        done();
      });
    });
  });
});
