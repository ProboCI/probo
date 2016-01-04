'use strict';
var through2 = require('through2');

var Script = require('../../lib/plugins/TaskRunner/Script');

var mockContainer = {
  log: {child: function() {}},
};

describe('Script', function() {
  var options = {};

  it('output filtering works', function(done) {
    var script = new Script(mockContainer, options);

    var stream = through2();
    var filtered = script.filterSecrets(['blah'], stream);
    stream.end('hello blah world');

    var data = '';
    filtered.on('data', function(chunk) {
      data += chunk.toString();
    }).on('end', function() {
      data.should.eql('hello <*****> world');
      done();
    });
  });
});

