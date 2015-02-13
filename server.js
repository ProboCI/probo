var http = require('http'),
    httpProxy = require('http-proxy'),
    redis = require('redis'),
    Docker = require('dockerode'),
    docker = new Docker({socketPath: '/var/run/docker.sock'});

var proxy = httpProxy.createProxyServer({});

var server = http.createServer(function(req, res) {
  var hostname = req.headers.host;
  lookupPort(hostname.substr(0, hostname.length - ('local'.length + 1)), 80, function(error, port) {
    if (error) {
      res.writeHead(500);
      res.end('The host could not be found...');
    }
    else {
      proxy.on('error', function(error) {
        res.end('An error occurred: ' + error.message);
      });
      var options = { 
        target: 'http://127.0.0.1:' + port,
        xfwd: true,
      };
      proxy.web(req, res, options);
    }
  });
});

server.on('upgrade', function (req, socket, head) {
  proxy.ws(req, socket, head);
});
server.listen(80);

function lookupPort(containerName, port, done) {
  var container = docker.getContainer(containerName);
  container.inspect(function (error, data) {
    if (error || !(data && data.NetworkSettings && data.NetworkSettings.Ports &&  data.NetworkSettings.Ports[port + '/tcp'][0].HostPort)) {
      return done(new Error('Could not find tcp port ' + port + ' on container ' + containerName));
    }
    else {
      done(null, data.NetworkSettings.Ports[port + '/tcp'][0].HostPort);
    }
  });
}


