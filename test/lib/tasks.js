var GitCheckout = require('../../lib/plugins/TaskRunner/GitCheckout')
var AssetDownloader = require('../../lib/plugins/TaskRunner/AssetDownloader')

var mock_container = {
  log: {child: function(){}}
}

describe("tasks", function(){
  describe("GitCheckout", function(){
    it("builds proper task configuration", function(){
      var gc = new GitCheckout(mock_container, {
        auth_token: "auth_token",
        provider_type: "github",
        repo_slug: "owner/repo",
        ref: "master"
      })

      gc.script.should.eql(`unset HISTFILE
export PS4='\$ '
set -x
mkdir /code
cd /code
wget -q -O - --header "Authorization:token auth_token" https://api.github.com/repos/owner/repo/tarball/master | tar xzf - --strip-components=1
`)

      gc.description().should.eql("GitCheckout owner/repo @ master")
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
mkdir /assets
cd /assets
wget -nv -O db.tgz http://asset.server/asset/bucket-name/db.tgz
wget -nv -O files.tgz http://asset.server/asset/bucket-name/files
`)

      ad.description().should.eql("AssetDownloader db.tgz, files")
    })
  })
})
  
