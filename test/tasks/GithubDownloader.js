'use strict';

require('should');

var GithubDownloader = require('../../lib/plugins/TaskRunner/GithubDownloader');

var mockContainer = {
  log: {child: function() {}},
  build: {
    links: {
      build: 'http://abc123.probo.build',
    },
  },
};


describe('GithubDownloader', function() {
  it('builds proper task configuration', function() {
    var build = {
      commit: {
        ref: 'master',
      },
    };
    var project = {
      provider: {type: 'github'},
      slug: 'owner/repo',
      service_auth: {token: 'auth_token'},
    };
    var gc = new GithubDownloader(mockContainer, {build, project});

    gc.script.should.equal(`unset HISTFILE
export PS4='$ '
set -ux
mkdir -p $SRC_DIR; cd $SRC_DIR
mkdir -p $SRC_DIR
cd $SRC_DIR
wget -q -O - --header "Authorization:token auth_token" https://api.github.com/repos/owner/repo/tarball/master | tar xzf - --strip-components=1
`);

    gc.description().should.equal('GithubDownloader owner/repo @ master');
  });
});

