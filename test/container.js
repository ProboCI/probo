'use strict';
var should = require('should');

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
});
