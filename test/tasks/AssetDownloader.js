'use strict';
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
  it('builds proper task configuration', function() {
    var options = {
      assetServerUrl: 'http://asset.server',
      assetBucket: 'bucket-name',
      assets: [
        'db.tgz',
        {files: 'files.tgz'},
      ],
    };
    var ad = new AssetDownloader(mockContainer, options);

    ad.script.should.eql(`unset HISTFILE
export PS4='$ '
set -x
mkdir -p $SRC_DIR; cd $SRC_DIR
mkdir -p $ASSET_DIR
cd $ASSET_DIR
wget -nv -O db.tgz http://asset.server/asset/bucket-name/db.tgz
wget -nv -O files.tgz http://asset.server/asset/bucket-name/files
`);

    ad.description().should.eql('AssetDownloader db.tgz, files');
  });
});

