'use strict';
var AssetDownloader = require('../../lib/plugins/TaskRunner/AssetDownloader');

var sinon = require('sinon');

var mockContainer = {
  log: {child: function() {}},
  containerConfig: {
    build: {
      links: {
        build: 'http://abc123.probo.build',
      },
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
    ad.setScript.getCall(1).args[0].should.eql([
      'mkdir -p $ASSET_DIR',
      'cd $ASSET_DIR',
      'wget -nv -O db.tgz  http://asset.server/asset/bucket-name/db.tgz',
      'wget -nv -O files.tgz  http://asset.server/asset/bucket-name/files',
    ]);

    ad.script.should.eql(`unset HISTFILE
export PS4='$ '
set -uex
mkdir -p $SRC_DIR; cd $SRC_DIR
export BUILD_DOMAIN=http://abc123.probo.build
mkdir -p $ASSET_DIR
cd $ASSET_DIR
wget -nv -O db.tgz  http://asset.server/asset/bucket-name/db.tgz
wget -nv -O files.tgz  http://asset.server/asset/bucket-name/files
`);

    ad.description().should.eql('AssetDownloader db.tgz, files');
  });

  it('builds proper task configuration with auth', function() {
    options.token = 'tok';
    var ad = new AssetDownloader(mockContainer, options);
    delete options.token;

    ad.setScript.getCall(1).args[0].should.eql([
      'mkdir -p $ASSET_DIR',
      'cd $ASSET_DIR',
      `wget -nv -O db.tgz --header='Authorization:Bearer tok' http://asset.server/asset/bucket-name/db.tgz`,
      `wget -nv -O files.tgz --header='Authorization:Bearer tok' http://asset.server/asset/bucket-name/files`,
    ]);

    ad.options.secrets.should.eql([
      'bucket-name',
      'tok',
    ]);

    ad.description().should.eql('AssetDownloader db.tgz, files');
  });
});

