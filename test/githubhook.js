var util = require('util');
var request = require('request');
var GithubHandler = require('../lib/GithubHandler');

var config = {
  githubWebhookPath: '/ghh',
  githubWebhookSecret: 'secret',
  githubAPIToken: 'token',
  port: 0
}
var server = new GithubHandler(config);

before("start GithubHandler server", function(done){
  server.start(function(){
    done();
  });
});

function http(path){
  var options = {
    url: util.format("http://%s:%s%s", 
                     server.server.address().address,
                     server.server.address().port,
                     path),
    json: true
  };

  return request.defaults(options);
}

describe("pull", function(){
  it("is handled", function(done){
    var payload = require('./pull_payload');

    var headers = {
      'X-GitHub-Delivery': 'a60aa880-df33-11e4-857c-eca3ec12497c',
      'X-GitHub-Event': 'pull_request',
      'X-Hub-Signature': 'sha1=6c429a591f467a1f6167416c3485f0ad1e8c52c5'
    }

    var r = http(config.githubWebhookPath)
      .post({body: payload, headers: headers}, function(err, res, body){
        // handles push bu returning OK and doing nothing else
        body.should.eql({ok: true});
        done();
      });
  });
});

describe("push", function(){
  it("is handled", function(done){
    var payload = require('./push_payload');

    var headers = {
      'X-GitHub-Event': 'push',
      'X-GitHub-Delivery': '8ec7bd00-df2b-11e4-9807-657b8ba6b6bd',
      'X-Hub-Signature': 'sha1=3899b659705481339f4d24faf79a62b052155b0b'
    }

    var r = http(config.githubWebhookPath)
      .post({body: payload, headers: headers}, function(err, res, body){
        // handles push bu returning OK and doing nothing else
        body.should.eql({ok: true});
        done();
      });
  });
});

