var co = require('co');
require('co-mocha');
var net = require('net');
var http = require('http');

var should = require('should');
var waitForPort = require('../../lib/waitForPort');

var wait_opts = {numRetries: 1, retryInterval: 100, debug: false};
function extend() {
  var ret = {};
  for (var i in arguments) {
    var arg = arguments[i];
    if (!arg) continue;
    for (var p in arg) {
      ret[p] = arg[p];
    }
  }
  return ret;
}

describe('waiting for port to be open', function() {
  describe('validates', function() {
    it('port', function() {
      (function() {
        waitForPort(null, null);
      }).should.throw('Invalid port: NaN');
    });

    it('type', function() {
      (function() {
        waitForPort('hi', 2213, {type: 'bad'});
      }).should.throw('Invalid check type: bad');
    });

    it('unknown options', function() {
      (function() {
        waitForPort('hi', 2213, {type: 'bad', retries: 3});
      }).should.throw('Invalid opt \'retries\', probably a typo');
    });

    it('returns a Promise', function() {
      var ret = waitForPort('hi', 2213);
      ret.should.have.property('then').which.is.type('function');
    });
  });

  describe('tcp', function() {
    var server, port;

    before('start TCP server', function(done) {
      server = net.createServer(function(socket) {
        socket.write('Echo server\r\n');
      }).listen(0, function listenting() {
        port = server.address().port;

        try {
          // if nock is enabled, disable it for this server
          var nock = require('nock');
          nock.enableNetConnect('localhost:' + port);
        } catch (e) {}


        done();
      });
    });

    after('close server', function() {
      server.close();
    });

    it('server is started', function() {
      should(port).be.type('number');
    });

    it('will connect', function(done) {
      waitForPort('localhost', port, extend(wait_opts, {type: 'tcp'}), function(err) {
        should.not.exist(err);
        done(err);
      });
    });

    it('will connect (promise-based)', function* () {
      yield waitForPort('localhost', port, extend(wait_opts, {type: 'tcp'}));
      // does not throw = good!
    });

    it('will timeout w/o server', function(done) {
      server.close();

      var start = +new Date();
      waitForPort('localhost', port, extend(wait_opts, {type: 'tcp'}), function(err) {
        var duration = +new Date() - start;
        should.exist(err);

        var expectedDuration = wait_opts.numRetries * wait_opts.retryInterval;
        duration.should.be.approximately(expectedDuration, 20);

        done();
      });
    });

    it('will timeout w/o server (promised-based)', function* () {
      // server is already closed

      var start = +new Date();
      var thrown = false;
      try {
        yield waitForPort('localhost', port, extend(wait_opts, {type: 'tcp'}));
      } catch (err) {
        thrown = true;
        var duration = +new Date() - start;
        should.exist(err);
      }
      thrown.should.eql(true);

      var expectedDuration = wait_opts.numRetries * wait_opts.retryInterval;
      duration.should.be.approximately(expectedDuration, 20);
    });
  });

  describe('http', function() {
    var server, port;

    before('start HTTP server', function(done) {
      server = http.createServer(function(req, res) {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World\n');
      }).listen(0, function listenting() {
        port = server.address().port;

        try {
          // if nock is enabled, disable it for this server
          var nock = require('nock');
          nock.enableNetConnect('localhost:' + port);
        } catch (e) {}

        done();
      });
    });

    after('close server', function() {
      server.close();
    });

    it('server is started', function(done) {
      should(port).be.type('number');
      done();
    });

    it('will connect to a server', function(done) {
      waitForPort('localhost', port, extend(wait_opts, {type: 'http'}), function(err) {
        should.not.exist(err);
        done(err);
      });
    });

    it('will timeout w/o server', function(done) {
      server.close();

      var start = +new Date();
      waitForPort('localhost', port, extend(wait_opts, {type: 'http'}), function(err) {
        var duration = +new Date() - start;
        should.exist(err);

        var expectedDuration = wait_opts.numRetries * wait_opts.retryInterval;
        duration.should.be.approximately(expectedDuration, 20);

        done();
      });
    });
  });
});
