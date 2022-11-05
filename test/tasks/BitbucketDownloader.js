'use strict';

require('should');

var BitbucketDownloader = require('../../lib/plugins/TaskRunner/BitbucketDownloader');

var mockContainer = {
  log: {
    child: function() {
      return {
        debug: function() {},
        error: function() {},
      };
    },
  },
};

describe('BitbucketDownloader', function() {
  it('builds proper task configuration', function() {
    var build = {
      commit: {
        ref: 'master',
      },
    };
    var project = {
      provider: {type: 'bitbucket'},
      owner: 'owner',
      repo: 'repo',
      service_auth: {
        token: 'access_token',
      },
    };
    var gc = new BitbucketDownloader(mockContainer, {build, project});

    gc.setBitbucketScript();

    gc.script.should.equal(`unset HISTFILE
export PS4='$ '
set -ux
mkdir -p $SRC_DIR; cd $SRC_DIR
mkdir -p $SRC_DIR
cd $SRC_DIR
wget -q -O - --header 'Authorization:Bearer access_token' "https://bitbucket.org/owner/repo/get/master.tar.gz" | tar xzf - --strip-components=1
`);

    gc.description().should.equal('BitbucketDownloader owner/repo @ master');
  });
});

