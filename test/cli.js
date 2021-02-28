'use strict';

var should = require('should');

var lib = require('..');
var cli = lib.cli;

describe('cli loader', function() {
  it('should load all relevant commands', function(done) {
    cli.loadCommands(function(error, data) {
      should.exist(data.help);
      done(error);
    });
  });
});


