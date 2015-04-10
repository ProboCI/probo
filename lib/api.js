var request = require('superagent');

var API = function(config){
  this.server = {
    host: config.host,
    port: config.port
  };
};

API.prototype.submitBuild = function(bulid){
  
}

module.exports = API;



