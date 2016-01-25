'use strict';
var lib = require('..');
var should = require('should');
var ContainerExec = lib.ContainerExec;
var MockContainer = require('./fixtures/MockContainer');

describe('ContainerExec', function() {
  it('should instantiate', function() {
    var containerExec = new ContainerExec({container: new MockContainer()});
  });
  it('should throw an exception if a container is not provided', function() {
    try {
      new ContainerExec();
      throw new Error('This error should not be thrown because anotehr is thrown above.');
    }
    catch(error) {
      should.exist(error);
    }
  });
});
