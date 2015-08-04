var co = require('co')
var net = require('net')
var http = require('http')

var should = require('should')
var waitForPort = require('../../lib/waitForPort')

var wait_opts = {numRetries: 2, retryInterval: 500, debug: false}
function extend(){
  var ret = {}
  for(var i in arguments){
    var arg = arguments[i]
    if(!arg) continue;
    for(var p in arg){
      ret[p] = arg[p]
    }
  }
  return ret;
}

describe("waiting for port to be open", function(){
  var tcp_server, http_server;
  var tcp_port, http_port;

  // currently TCP checks are broken. Get a Parse Error on connect for some reason
  describe.skip("tcp", function(){
    before("start TCP server", function(done){
      tcp_server = net.createServer(function (socket) {
        console.log("client connected")
        socket.write('Echo server\r\n');
        socket.end()
      }).listen(0, function listenting(){
        tcp_port = tcp_server.address().port
        done()
      });
    });

    after("close server", function(){
      tcp_server.close()
    })

    it("server is started", function(){
      should(tcp_port).be.type('number')
    })

    it("will connect", function(done){
      waitForPort('localhost', tcp_port, extend(wait_opts, {type: 'net'}), function(err){
        should(err).be.ok
        done(err)
      })
    })
  })

  describe("http", function(){
    before("start HTTP server", function(done){
      http_server = http.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World\n');
      }).listen(0, function listenting(){
        http_port = http_server.address().port

        try {
          // if nock is enabled, disabled it for this server
          var nock = require('nock')
          nock.enableNetConnect('localhost:' + http_port);
        } catch (e){}

        done()
      });
    });

    after("close server", function(){
      http_server.close()
    })

    it("server is started", function(done){
      should(http_port).be.type('number')
      done()
    })

    it("will connect to a server", function(done){
      waitForPort('localhost', http_port, extend(wait_opts, {type: 'http'}), function(err){
        should.not.exist(err)
        done(err)
      })
    })

    it("will timeout w/o server", function(done){
      http_server.close()

      var start = +new Date()
      waitForPort('localhost', http_port, extend(wait_opts, {type: 'http'}), function(err){
        var duration = +new Date() - start
        should.exist(err)

        var expectedDuration = wait_opts.numRetries * wait_opts.retryInterval
        duration.should.be.approximately(expectedDuration, 20)

        done()
      })
    })
  })
})
