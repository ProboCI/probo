var lib = require('..')
var Build = lib.Build
var Container = lib.Container

describe('Build', function() {
  describe('constructor', function() {
    it('should create and populate a build object', function(done) {
      var build = new Build()
      var container = new Container({ docker: null })
      build.setContainer(container)
      var Step = function() {}
      Step.prototype.run = function(cb) {
        cb()
      }
      build.addStep(new Step())
      build.on('taskStart', function() {
        console.log('task started')
      })
      build.run(function(error) {
        done()
      });
    })
  })
})
