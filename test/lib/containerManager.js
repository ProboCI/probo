'use strict';

var path = require('path');
var request = require('request');
var should = require('should');
var level = require('level');

var Loader = require('yaml-config-loader');
var ContainerManager = require('../../lib/ContainerManager');
var server = new ContainerManager();
var loader = new Loader();
var db = level('/tmp/db', {db: require('memdown')});

const port = 9876;

// Build ids associated with the various tests. The `reapedBuildId` and
// pendingBuildId are used in the test setup to provide real results upon
// lookup.
const reapedBuildId = 'a38c39ed-3bb9-44ba-9050-8a4337384d3b';
const pendingBuildId = 'c65c469a-60a9-43bb-848c-e96242e6b610';
const accessiblePendingBuildId = 'e37d1b61-7da4-46d9-b559-a2086a4c9c1c';
const missingBuildId = 'fedcda29-cf3b-4ff3-83ce-308a632d477b';
const badBuildId = '38c39ed-3bb9-44ba-9050-8a4337384d3b';

const requestOptions = {
  method: 'POST',
  headers: {
    accept: 'application/json',
    authorization: 'Bearer testToken',
  },
};

loader.add(path.resolve(path.join(__dirname, '../..', 'defaults.yaml')));


describe('Server', function() {

  before('start server', function(done) {
    var nock = require('nock');
    nock.enableNetConnect('localhost:' + port);
    loader.load(function(err, config) {
      if (err) {
        return done(err);
      }
      config.levelupDB = db;
      config.port = port;
      config.api.token = 'testToken';

      db.put(`builds!${reapedBuildId}`, JSON.stringify({container: true, reaped: true}));
      db.put(`builds!${pendingBuildId}`, JSON.stringify({container: false, reaped: false, status: 'running'}));
      db.put(`builds!${accessiblePendingBuildId}`, JSON.stringify({container: false, reaped: false, status: 'running', config: {allowAccessWhileBuilding: true}}));
      config.logLevel = Number.POSITIVE_INFINITY;
      server.configure(config, function(err) {
        if (err) {
          return done(err);
        }
        server.run({config: config}, function(err) {
          if (err) {
            return done(err);
          }
          return done();
        });
      });
    });
  });

  after('Stop server', function(done) {
    server.close();
    done();
  });

  it('should return an error if the build id is invalid', function(done) {
    const opts = Object.assign(requestOptions, {
      url: `http://localhost:${port}/container/proxy?build=${badBuildId}`,
    });

    request(opts, function(error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(400);
      var jsonResponse = JSON.parse(body);
      jsonResponse.should.have.property('errorCode');
      jsonResponse.errorCode.should.equal('400I');
      jsonResponse.message.should.equal('Build id is invalid');
      done();
    });
  });

  it('should return an error if the build has been reaped', function(done) {
    const opts = Object.assign(requestOptions, {
      url: `http://localhost:${port}/container/proxy?build=${reapedBuildId}`,
    });

    request(opts, function(error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(410);
      var jsonResponse = JSON.parse(body);
      jsonResponse.should.have.property('errorCode');
      jsonResponse.errorCode.should.equal('410R');
      jsonResponse.message.should.equal('Build has been reaped');
      done();
    });
  });

  describe('builds in progress', function() {

    it('should return an error by default', function(done) {
      const opts = Object.assign(requestOptions, {
        url: `http://localhost:${port}/container/proxy?build=${pendingBuildId}`,
      });

      request(opts, function(error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(423);
        var jsonResponse = JSON.parse(body);
        jsonResponse.should.have.property('errorCode');
        jsonResponse.errorCode.should.equal('423P');
        jsonResponse.message.should.equal('Build is still in progress');
        done();
      });
    });

    it('should not return an error if the build is configured to be visible via the allowAccessWhileBuilding configuration', function(done) {
      const opts = Object.assign(requestOptions, {
        url: `http://localhost:${port}/container/proxy?build=${accessiblePendingBuildId}`,
      });

      request(opts, function(error, response, body) {
        should.not.exist(error);
        // The fact that we did not get a 423 as in the previous test shoudl prove this config
        // variable is active and doing the right thing, however we can't actually find a container
        // that doesn't exist, so we're falling through here.
        response.statusCode.should.equal(404);
        response.body.should.containEql('Could not get container');
        done();
      });
    });

  });

  it('should return an error if the build id cannot be found', function(done) {
    const opts = Object.assign(requestOptions, {
      url: `http://localhost:${port}/container/proxy?build=${missingBuildId}`,
    });

    request(opts, function(error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(404);
      var jsonResponse = JSON.parse(body);
      jsonResponse.should.have.property('errorCode');
      jsonResponse.errorCode.should.equal('404N');
      jsonResponse.message.should.equal(`Build not found for build id: ${missingBuildId}`);
      done();
    });
  });
});
