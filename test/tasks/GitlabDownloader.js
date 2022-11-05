'use strict';

require('should');

var GitlabDownloader = require('../../lib/plugins/TaskRunner/GitlabDownloader');

var mockContainer = {
  log: {child: function() {}},
  build: {
    links: {
      build: 'http://abc123.probo.build',
    },
  },
};


describe('GitlabDownloader', function() {
  it('builds proper task configuration', function() {
    var build = {
      commit: {
        ref: 'master',
      },
    };
    var project = {
      provider: {type: 'gitlab'},
      slug: 'owner/repo',
      provider_id: 1234,
      service_auth: {token: 'auth_token'},
    };
    var gc = new GitlabDownloader(mockContainer, {build, project});

    gc.script.should.equal(`unset HISTFILE
export PS4='$ '
set -ux
mkdir -p $SRC_DIR; cd $SRC_DIR
mkdir -p $SRC_DIR
cd $SRC_DIR
curl --header "Authorization: Bearer auth_token" https://gitlab.com/api/v4/projects/1234/repository/archive?sha=master | tar xzf - --strip-components=1
`);

    gc.description().should.equal('GitlabDownloader 1234 @ master');
  });
});

