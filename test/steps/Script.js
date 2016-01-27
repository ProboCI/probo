'use strict';
var through2 = require('through2');

var Script = require('../../lib/plugins/Step/Script');

var MockContainer = require('../fixtures/MockContainer');

describe('Script', function() {
  it('output filtering works', function(done) {
    var mockContainer = new MockContainer({execOutput: ['hello blah world']});
    var script = new Script(mockContainer, {secrets: ['blah'], log: mockContainer.log});
    script.run();
    var history = [];
    script.stream.pipe(through2.obj(function(data, enc, cb) {
      history.push(data);
      cb(null, data);
    }, function() {
      history[0].data.should.equal('hello <*****> world');
      done();
    }));
  });
});

