'use strict';
var GithubDownloader = require('../../lib/plugins/Step/CodeDownloaders/GithubDownloader');
var lib = require('../..');
var Build = lib.Build;

var mockContainer = {
  log: {child: function() {}},
};

describe('GithubDownloader', function() {
  it('builds proper task configuration', function() {
    var commit = {
      ref: 'master',
    };
    var project = {
      provider: {type: 'github'},
      slug: 'owner/repo',
      service_auth: {token: 'auth_token'},
    };
    var build = new Build({commit, project});
    var gc = new GithubDownloader(mockContainer, {build});

    gc.script.should.eql(`unset HISTFILE
export PS4='\$ '
set -x
mkdir -p $SRC_DIR; cd $SRC_DIR
mkdir -p $SRC_DIR
cd $SRC_DIR
wget -q -O - --header "Authorization:token auth_token" https://api.github.com/repos/owner/repo/tarball/master | tar xzf - --strip-components=1
exit
`);

    gc.description().should.eql('GithubDownloader owner/repo @ master');
  });
});

