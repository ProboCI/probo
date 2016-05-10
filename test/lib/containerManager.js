'use strict';

var path = require('path');
var request = require('request');
var should = require('should');
var level = require('level');

var Loader = require('yaml-config-loader');
var CM = require('../../lib/ContainerManager');
var server = new CM();
var loader = new Loader();
var db = level('/tmp/db', {db: require('memdown')});

const port = 9876;
const reapedBuildId = 'a38c39ed-3bb9-44ba-9050-8a4337384d3b';
const pendingBuildId = 'c65c469a-60a9-43bb-848c-e96242e6b610';
const missingBuildId = 'fedcda29-cf3b-4ff3-83ce-308a632d477b';

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
      db.put(`builds!${pendingBuildId}`, JSON.stringify({container: false, reaped: false}));
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
    server = null;
    done();
  });

  it('should return an error if the build id is invalid', function(done) {
    const badBuildId = '38c39ed-3bb9-44ba-9050-8a4337384d3b';
    var opts = {
      url: `http://localhost:${port}/container/proxy?build=${badBuildId}`,
      method: 'POST',
      headers: {
        authorization: 'Bearer testToken',
      },
    };
    request(opts, function(error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(404);
      var jsonResponse = JSON.parse(body);
      jsonResponse.should.have.property('errorCode');
      jsonResponse.errorCode.should.equal('404I');
      jsonResponse.message.should.equal('Build id is invalid');
      done();
    });
  });

  it('should return an error if the build has been reaped', function(done) {
    var opts = {
      url: `http://localhost:${port}/container/proxy?build=${reapedBuildId}`,
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer testToken',
      },
    };
    request(opts, function(error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(404);
      var jsonResponse = JSON.parse(body);
      jsonResponse.should.have.property('errorCode');
      jsonResponse.errorCode.should.equal('404R');
      jsonResponse.message.should.equal('Build has been reaped');
      done();
    });
  });

  it('should return an error if the build is still in progress', function(done) {
    var opts = {
      url: `http://localhost:${port}/container/proxy?build=${pendingBuildId}`,
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer testToken',
      },
    };
    request(opts, function(error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(404);
      var jsonResponse = JSON.parse(body);
      jsonResponse.should.have.property('errorCode');
      jsonResponse.errorCode.should.equal('404P');
      jsonResponse.message.should.equal('Build is still in progress');
      done();
    });
  });

  it('should return an error if the build id cannot be found', function(done) {
    var opts = {
      url: `http://localhost:${port}/container/proxy?build=${missingBuildId}`,
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer testToken',
      },
    };
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
