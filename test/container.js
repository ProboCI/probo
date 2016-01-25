'use strict';
var should = require('should');
var sinon = require('sinon');
var Resolver = require('multiple-callback-resolver');

var lib = require('..');
var Container = lib.Container;

describe('Container', function() {
  it('should construct a container object', function() {
    var container = new Container();
    should.exist(container);
  });
  it('should throw an exception if a non-existant image configuration is provided');
  it('should construct the appropriate penelope build options', function() {
    var imageOptions = {
      services: {
        apache: {
          command: '/usr/sbin/apache2ctl -D FOREGROUND',
          port: 80,
        },
      },
    };
    var container = new Container();
    var info = container.buildCommandInfo(imageOptions);
    info.command.should.be.instanceof(Array);
    info.exposedPorts.should.be.instanceof(Object).and.have.property('80/tcp');
    info.portBindings.should.be.instanceof(Object).and.have.property('80/tcp');
    info.portBindings['80/tcp'].should.be.instanceof(Array).and.have.lengthOf(1);
    info.portBindings['80/tcp'][0].should.be.instanceof(Object).and.have.property('HostPort', null);
    should.exist(info);
  });
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
        cb(null, require('./fixtures/container_inspect.json'));
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
