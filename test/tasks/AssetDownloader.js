'use strict';

require('should');

var sinon = require('sinon');

var AssetDownloader = require('../../lib/plugins/TaskRunner/AssetDownloader');

var mockContainer = {
  log: {child: function() {}},
  build: {
    links: {
      build: 'http://abc123.probo.build',
    },
  },
};

describe('AssetDownloader', function() {
  var options = {
    url: 'http://asset.server',
    bucket: 'bucket-name',
    assets: [
      'db.tgz',
      {files: 'files.tgz'},
    ],
  };

  beforeEach(function() {
    sinon.spy(AssetDownloader.prototype, 'setScript');
  });

  afterEach(function() {
    AssetDownloader.prototype.setScript.restore();
  });

  it('builds proper task configuration', function() {
    var ad = new AssetDownloader(mockContainer, options);

    // ensure that AssetDownloader is creating the correct script
    // (first call to setScript happens in the Script constructor)
    ad.setScript.getCall(1).args[0].should.be.eql([
      'mkdir -p $ASSET_DIR',
      'cd $ASSET_DIR',
      'wget -nv -O db.tgz  http://asset.server/asset/bucket-name/db.tgz',
      'wget -nv -O files.tgz  http://asset.server/asset/bucket-name/files',
    ]);

    ad.script.should.be.eql(`unset HISTFILE
export PS4='$ '
set -ux
mkdir -p $SRC_DIR; cd $SRC_DIR
mkdir -p $ASSET_DIR
cd $ASSET_DIR
wget -nv -O db.tgz  http://asset.server/asset/bucket-name/db.tgz
wget -nv -O files.tgz  http://asset.server/asset/bucket-name/files
`);

    ad.description().should.equal('AssetDownloader db.tgz, files');
  });

  it('builds proper task configuration with auth', function() {
    options.token = 'tok';
    var ad = new AssetDownloader(mockContainer, options);
    delete options.token;

    ad.setScript.getCall(1).args[0].should.be.eql([
      'mkdir -p $ASSET_DIR',
      'cd $ASSET_DIR',
      'wget -nv -O db.tgz --header=\'Authorization:Bearer tok\' http://asset.server/asset/bucket-name/db.tgz',
      'wget -nv -O files.tgz --header=\'Authorization:Bearer tok\' http://asset.server/asset/bucket-name/files',
    ]);

    ad.options.secrets.should.be.eql([
      'bucket-name',
      'tok',
      'http://asset.server',
    ]);

    ad.description().should.equal('AssetDownloader db.tgz, files');
  });
});

