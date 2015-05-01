var util = require('util');
var request = require('request');
var should = require('should');

var GithubHandler = require('../lib/GithubHandler');

var config = {
  githubWebhookPath: '/ghh',
  githubWebhookSecret: 'secret',
  githubAPIToken: 'token',
  port: 0,
  githubAPIToken: '937bf3fcff65a3b034109efcca28f5d0ae24e364', //ilya's personal token
  api: {
    url: "http://localhost:3000",
    token: "token2"
  }
}
var ghh_server = new GithubHandler(config);
ghh_server.log._level = Number.POSITIVE_INFINITY;

// disable logging
//ghh_server.log._level = Number.POSITIVE_INFINITY;

// mock out API calls
var nocked = {};
var required_nocks = [];

var nock = require('nock');
function init_nock(){
  //nock.enableNetConnect();

  var project = {
    id: '1234',
    service: "github",
    owner: "zanchin",
    repo: "testrepo",
    slug: "zanchin/testrepo"
  }

  var build = {
    id: "build1",
    projectId: "123",
    sha: "9dd7d8b3ccf6cdecc86920535e52c4d50da7bd64",
    project: project
  }

  // nock out ghh server - pass these requests through
  nock.enableNetConnect(util.format("%s:%s",
                                    ghh_server.server.address().address,
                                    ghh_server.server.address().port));


  // nock out API URLs
  nocked['project_search'] = nock(config.api.url)
    .get("/projects?service=github&slug=zanchin%2Ftestrepo&single=true")
    .reply(200, project);

  nocked['startbuild'] = nock(config.api.url)
    .post("/startbuild")
    .reply(200, build);

  nocked['status_update'] = nock(config.api.url)
    .persist()
    .filteringPath(/status\/[^/]*/g, 'status/context')
    .post("/builds/" + build.id + "/status/context")
    .reply(200, {
      "state": "success",
      "description": "Tests passed Thu Apr 30 2015 17:41:43 GMT-0400 (EDT)",
      "context": "ci/tests"
    });

  // nock out github URLs
  var nocks = nock.load('./test/http_capture.json');
  nocks.forEach(function(n, i){
    if(i != 2){
      nocked['github_' + i] = n;
    }
  });

  Object.keys(nocked).filter(function(name){
    var excluded = ["status_update"];
    return excluded.indexOf(name) < 0;
  }).forEach(function(name){
    required_nocks.push(nocked[name]);
  });

  // nock.recorder.rec({
  //   output_objects: true,
  //   dont_print: true
  // });
}

before("start GithubHandler server", function(done){
  ghh_server.start(function(){
    init_nock();
    done();
  });
});

after("stop GithubHandler server", function(done){
  ghh_server.stop(done);

  // var nockCallObjects = nock.recorder.play();
  // require('fs').writeFileSync("http_capture.json", util.inspect(nockCallObjects, null, 5));
});

function http(path){
  var options = {
    url: util.format("http://%s:%s%s",
                     ghh_server.server.address().address,
                     ghh_server.server.address().port,
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
      'X-Hub-Signature': 'sha1=4636d00906034f52c099dfedae96095f8832994c'
    }

    // var r = http(config.githubWebhookPath)
    //   .post({body: payload, headers: headers}, function _(err, res, body){

    // fire off handler event
    var event = {
      event: 'pull_request',
      id: 'a60aa880-df33-11e4-857c-eca3ec12497c',
      url: '/ghh',
      payload: payload
    };
    ghh_server.pullRequestHandler(event, function(err, build){
        // handles push by returning OK and doing nothing else
        should.not.exist(err);
        // body.should.eql({ok: true});

        // make sure all internal calls were made
        for(var nock_name in required_nocks){
          required_nocks[nock_name].done();
        }

        done();

        // // wait a while and then trigger a status update
        // setTimeout(function(){
        //   http("/update")
        //     .post({
        //       body: {
        //         update: {
        //           state: "pending",
        //           description: "Environment built!",
        //           context: "ci/env",
        //           target_url: ""
        //         },
        //         build: {
        //           projectId: "123",

        //           status: 'success',
        //           ref: "d0fdf6c2d2b5e7402985f1e720aa27e40d018194",

        //           project: {
        //             id: '1234',
        //             service: "github",
        //             owner: "zanchin",
        //             repo: "testrepo",
        //             slug: "zanchin/testrepo"
        //           }
        //         }
        //       }
        //     }, function(err, res, body){
        //       if(err) console.log(err)

        //       body.should.eql({success: true})

        //       done(err);
        //     });
        // }, 1000);
     });
  });
});

// describe("push", function(){
//   it("is handled", function(done){
//     var payload = require('./push_payload');

//     var headers = {
//       'X-GitHub-Event': 'push',
//       'X-GitHub-Delivery': '8ec7bd00-df2b-11e4-9807-657b8ba6b6bd',
//       'X-Hub-Signature': 'sha1=cb4c474352a7708d24fffa864dab9919f54ac2f6'
//     }

//     var r = http(config.githubWebhookPath)
//       .post({body: payload, headers: headers}, function(err, res, body){
//         // handles push bu returning OK and doing nothing else
//         body.should.eql({ok: true});
//         done();
//       });
//   });
// });
