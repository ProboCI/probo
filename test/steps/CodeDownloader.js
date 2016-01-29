'use strict';
var should = require('should');
var lib = require('../..');
var Build = lib.Build;
var CodeDownloader = lib.plugins.Step.CodeDownloader;
// var GithubDownloader = require('../../lib/plugins/Step/CodeDownloaders/GithubDownloader');
var MockContainer = require('../fixtures/MockContainer');

describe('CodeDownloader', function() {
  it('should return the appriate handler when initialized', function() {
    var buildOpts = {
      commit: {
        ref: 'blah',
      },
      project: {
        provider: {
          type: 'github',
        },
        service_auth: {
          token: 'auth_token',
        },
      },
    };
    var build = new Build(buildOpts);
    var Downloader = new CodeDownloader(new MockContainer(), {build});
    should.exist(Downloader);
    should.exist(Downloader.run);
    //Downloader.prototype.should.equal(GithubDownloader);
  });
});
