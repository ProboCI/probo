var GithubDownloader = require('../../lib/plugins/TaskRunner/GithubDownloader')
var AssetDownloader = require('../../lib/plugins/TaskRunner/AssetDownloader')

var mock_container = {
  log: {child: function(){}}
}

describe("tasks", function(){
  describe("GithubDownloader", function(){
    it("builds proper task configuration", function(){
      var build = {
        ref: "master"
      }
      var project = {
        provider: { type: 'github' },
        slug: 'owner/repo',
        service_auth: {token: "auth_token"}
      }
      var gc = new GithubDownloader(mock_container, {build, project})

      gc.script.should.eql(`unset HISTFILE
export PS4='\$ '
set -x
mkdir -p $SRC_DIR; cd $SRC_DIR
mkdir -p $SRC_DIR
cd $SRC_DIR
wget -q -O - --header "Authorization:token auth_token" https://api.github.com/repos/owner/repo/tarball/master | tar xzf - --strip-components=1
`)

      gc.description().should.eql("GithubDownloader owner/repo @ master")
    })
  })


  describe("AssetDownloader", function(){
    it("builds proper task configuration", function(){
      var ad = new AssetDownloader(mock_container, {
        asset_server_url: "http://asset.server",
        asset_bucket: "bucket-name",
        assets: [
          "db.tgz",
          {"files": "files.tgz"}
        ]
      })

      ad.script.should.eql(`unset HISTFILE
export PS4='$ '
set -x
mkdir -p $SRC_DIR; cd $SRC_DIR
mkdir -p $ASSET_DIR
cd $ASSET_DIR
wget -nv -O db.tgz http://asset.server/asset/bucket-name/db.tgz
wget -nv -O files.tgz http://asset.server/asset/bucket-name/files
`)

      ad.description().should.eql("AssetDownloader db.tgz, files")
    })
  })
})
  
