'use strict';

const fs = require('fs');
const nock = require('nock');
const request = require('request');
const should = require('should');
const sinon = require('sinon');
const util = require('util');
const yaml = require('js-yaml');

const nockout = require('./__nockout');

const GithubHandler = require('../lib/GithubHandler');

let config = {
  githubWebhookPath: '/ghh',
  githubWebhookSecret: 'secret',
  githubAPIToken: 'token',
  port: 0,
  api: {
    url: 'http://localhost:3000',
    token: 'token',
  },
  logLevel: Number.POSITIVE_INFINITY,
};

let ghhServer = new GithubHandler(config);

function http(path, ghh) {
  ghh = ghh || ghhServer;
  let options = {
    url: util.format('%s%s', ghh.server.url, path),
    json: true,
  };

  return request.defaults(options);
}

describe('GithubHandler', () => {
  describe('webhooks', () => {

    before('start GithubHandler server', () => {
      ghhServer.start();
    });

    after('stop GithubHandler server', () => {
      ghhServer.close();
    });


    describe('pull', () => {
      let nocker;
      let handlerMocked;

      before(() => {
        // Mocks the download of the probo.yaml config file.
        handlerMocked = sinon.stub(ghhServer.github, 'fetchProboYamlConfig')
          .callsFake((project, sha, cb) => {
            let settings = yaml.safeLoad(fs.readFileSync('test/files/probo.yaml', 'utf8'));

            cb(null, settings);
          });
      });

      beforeEach('nock out network calls', () => {
        nocker = initNock();
      });

      after(() => {
        handlerMocked.restore();
      });

      afterEach('reset network mocks', () => {
        nocker.cleanup();
      });

      it('is routed', done => {
        let payload = require('./fixtures/pull_payload');
        let headers = {
          'X-GitHub-Delivery': 'a60aa880-df33-11e4-857c-eca3ec12497c',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature': 'sha1=4636d00906034f52c099dfedae96095f8832994c',
        };
        http(config.githubWebhookPath)
          .post({body: payload, headers: headers}, function(err, res, body) {
            should.not.exist(err);
            body.should.eql({ok: true});

            // TODO: WAT? why isn't this a set of async callbacks so we actually know when it's done?!
            // pause for a little before finishing to allow push processing to run
            // and hit all the GH nocked endpoints
            setTimeout(done, 200);
          });
      });


      it('is handled', done => {
        let payload = require('./fixtures/pull_payload');

        // fire off handler event
        let event = {
          event: 'pull_request',
          id: 'a60aa880-df33-11e4-857c-eca3ec12497c',
          url: '/ghh',
          payload: payload,
        };
        ghhServer.pullRequestHandler(event, function(err, build) {
          should.not.exist(err);
          build.should.be.an.instanceOf(Object);
          build.id.should.equal('build1');
          build.projectId.should.equal('1234');
          build.commit.should.be.an.instanceOf(Object);
          build.commit.ref.should.equal('9dd7d8b3ccf6cdecc86920535e52c4d50da7bd64');
          build.pullRequest.should.be.an.instanceOf(Object);
          build.pullRequest.number.should.equal('1');
          build.branch.should.be.an.instanceOf(Object);
          build.branch.name.should.equal('feature');

          build.config.should.eql({
            steps: [{
              name: 'Probo site setup',
              plugin: 'LAMPApp',
            }],
          });

          build.project.should.eql({
            id: '1234',
            // provider_id: 33704441,
            owner: 'zanchin',
            repo: 'testrepo',
            service: 'github',
            slug: 'zanchin/testrepo',
          });

          build.request.should.eql({
            branch: 'feature',
            branch_html_url: 'https://github.com/zanchin/testrepo/tree/feature',
            commit_url: 'https://github.com/zanchin/testrepo/commit/9dd7d8b3ccf6cdecc86920535e52c4d50da7bd64',
            pull_request_id: 33015959,
            pull_request_description: '',
            pull_request_html_url: 'https://github.com/zanchin/testrepo/pull/1',
            pull_request_name: 'added file2',
            owner: 'zanchin',
            pull_request: 1,
            repo: 'testrepo',
            repo_id: 33704441,
            service: 'github',
            sha: '9dd7d8b3ccf6cdecc86920535e52c4d50da7bd64',
            slug: 'zanchin/testrepo',
            type: 'pull_request',
            payload: payload,
          });

          done();
        });
      });
    });

    describe('push', () => {
      it('is handled', done => {
        let payload = require('./push_payload');

        let headers = {
          'X-GitHub-Event': 'push',
          'X-GitHub-Delivery': '8ec7bd00-df2b-11e4-9807-657b8ba6b6bd',
          'X-Hub-Signature': 'sha1=cb4c474352a7708d24fffa864dab9919f54ac2f6',
        };

        http(config.githubWebhookPath).post({body: payload, headers: headers}, function(err, res, body) {
          // handles push bu returning OK and doing nothing else
          body.should.eql({ok: true});
          done();
        });
      });
    });
  });

  describe('status update endpoint', () => {
    let ghh;

    before('start another ghh', done => {
      ghh = new GithubHandler(config);
      ghh.start(() => {
        nock.enableNetConnect(ghh.server.url.replace('http://', ''));
        done();
      });
    });

    let mocked;
    before('set up mocks', () => {
      // call the first cb arg w/ no arguments
      mocked = sinon.stub(ghh.github, 'postStatus').yields();
    });

    after('clear mocks', done => {
      mocked.restore();

      // Stops the second GitHubHandler server.
      ghh.close(done);
    });

    it('accepts /update', done => {

      let update = {
        state: 'pending',
        description: 'Environment built!',
        context: 'ci/env',
        target_url: 'http://my_url.com',
      };

      let build = {
        projectId: '123',

        status: 'success',
        commit: {
          ref: 'd0fdf6c2d2b5e7402985f1e720aa27e40d018194',
        },
        project: {
          id: '1234',
          service: 'github',
          owner: 'zanchin',
          repo: 'testrepo',
          slug: 'zanchin/testrepo',
        },
      };

      http('/update', ghh).post({body: {
        update: update,
        build: build,
      }}, function _(err, res, body) {
        should.not.exist(err);
        body.should.eql(update);

        done(err);
      });
    });

    it('accepts /builds/:bid/status/:context', done => {
      let update = {
        state: 'pending',
        description: 'Environment built!',
        context: 'ignored context',
        target_url: 'http://my_url.com',
      };

      let build = {
        projectId: '123',

        status: 'success',
        commit: {
          ref: 'd0fdf6c2d2b5e7402985f1e720aa27e40d018194',
        },
        project: {
          id: '1234',
          service: 'github',
          owner: 'zanchin',
          repo: 'testrepo',
          slug: 'zanchin/testrepo',
        },
      };

      http('/builds/' + build.id + '/status/' + 'ci-env', ghh).post({body: {
        update: update,
        build: build,
      }}, function _(err, res, body) {
        should.not.exist(err);
        body.should.eql({
          state: 'pending',
          description: 'Environment built!',
          // NOTE context gets inserted from URL
          context: 'ci-env',
          target_url: 'http://my_url.com',
        });

        done(err);
      });
    });
  });


  describe('probo.yaml file parsing', () => {
    let mocks = [];
    let updateSpy;
    let ghh;

    let errorMessage = `Failed to parse probo config file:bad indentation of a mapping entry at line 3, column 3:
      command: 'bad command'
      ^`;

    before('init mocks', () => {
      ghh = new GithubHandler(config);

      // mock out Github API calls
      mocks.push(sinon.stub(ghh.github, 'getApi').returns({
        repos: {
          getContents: function(opts) {
            if (opts.path === '') {
              // listing of files
              return Promise.resolve({
                data: [{name: '.probo.yaml'}],
              });
            }
            else {
              // Getting content of a file - return a malformed YAML file.
              return Promise.resolve({
                path: '.probo.yaml',
                data: {
                  content: new Buffer.from(`steps:
  - name: task
  command: 'bad command'`).toString('base64'),
                },
              });
            }
          },
        },
      }));

      // mock out internal API calls
      mocks.push(
        sinon.stub(ghh.api, 'findProjectByRepo').yields(null, {})
      );

      // ensure that buildStatusUpdateHandler is called
      updateSpy = sinon.stub(ghh, 'buildStatusUpdateHandler').yields();
      mocks.push(updateSpy);
    });

    after('restore mocks', () => {
      mocks.forEach(function(mock) {
        mock.reset();
      });
    });

    it('throws an error for a bad yaml', done => {
      ghh.github.fetchProboYamlConfig({}, null, function(err) {
        err.message.should.eql(errorMessage);
        done();
      });
    });

    it('sends status update for bad yaml', done => {
      ghh.processPullRequest({sha: 'sha1'}, () => {
        let param1 = {
          state: 'failure',
          description: errorMessage,
          context: 'ProboCI/env',
        };
        let param2 = {
          commit: {ref: 'sha1'},
          project: {},
        };
        updateSpy.calledWith(param1, param2).should.equal(true);
        done();
      });
    });
  });
});

function initNock() {
  let project = {
    id: '1234',
    service: 'github',
    owner: 'zanchin',
    repo: 'testrepo',
    slug: 'zanchin/testrepo',
  };

  let buildId = 'build1';

  // Enables requests to GitLab Handler through.
  nock.enableNetConnect(ghhServer.server.url.replace('http://', ''));

  // Nocks out URLs related to the container API.
  return nockout({
    not_required: ['status_update'],
    processor: nocks => {
      // nock out API URLs
      nocks.push(nock(config.api.url)
        .get('/projects?service=github&slug=zanchin%2Ftestrepo&single=true')
        .reply(200, project));
      nocks[nocks.length - 1].name = 'project_search';

      nocks.push(nock(config.api.url)
        .defaultReplyHeaders({
          'Content-Type': 'application/json',
        })
        .post('/startbuild')
        .reply(200, function(uri, requestBody) {
          // start build sets id and project id on build
          // and puts project inside build, returning build
          let body = requestBody;
          body.build.id = buildId;
          body.build.projectId = body.project.id;
          body.build.project = body.project;
          delete body.project;
          return body.build;
        }));
      nocks[nocks.length - 1].name = 'startbuild';

      nocks.push(nock(config.api.url)
        .persist()
        .filteringPath(/status\/[^/]*/g, 'status/context')
        .post('/builds/' + buildId + '/status/context')
        .reply(200, {
          state: 'success',
          description: 'Tests passed Thu Apr 30 2015 17:41:43 GMT-0400 (EDT)',
          context: 'ci/tests',
        }));
      nocks[nocks.length - 1].name = 'status_update';
    },
  });
}
