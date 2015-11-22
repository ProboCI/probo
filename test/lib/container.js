// NOTE: run this test independently as
// npm test test/lib/container.js

require('co-mocha');
var sinon = require('sinon');
var Promise = require('bluebird');

var child_process = require('child_process');

var Container = require('../../lib/Container');

//require('nock').restore()

describe('Container', function() {
  describe('events', function() {
    it('fires a generic stateChange event', function(done) {
      var container = new Container({});

      var event = sinon.spy();
      var stateChange = function() {
        event.called.should.be.ok;

        var args = Array.prototype.slice.call(arguments);
        args.should.eql(['stopping']);

        done();
      };

      container.on('stopping', event);
      container.on('stateChange', stateChange);

      // stub out stop method on internal container
      container.container = {stop: sinon.spy()};

      container.stop();
    });
  });

  describe.only('stats', function() {
    var container, containerInfo;

    before(function*() {
      container = new Container({
        docker: {
          socketPath: '/var/run/docker.sock'
        },
        image: 'proboci/ubuntu-14.04-lamp',
        imageConfig: {
          'proboci/ubuntu-14.04-lamp': {
            services: []
          }
        },
        build: {
          ref: null,
          id: null
        }
      });

      Promise.promisifyAll(container);

      // will start the container too
      containerInfo = yield container.create();
      container.containerId = containerInfo.Id;
    });

    after(function*() {
      yield container.remove({force: true});
    });

    it('image size', function* () {
      var size = yield container.imageSizeAsync(containerInfo.Image);
      size.should.be.a.Number;
    });

    it('container size', function* () {
      // test 1: make sure execing and parsing works
      var stubs = sinon.stub(child_process, 'exec').yields(null, '123 /var/lib/...', '');
      try {
        var size = yield container.containerSizeAsync();
        size.should.be.a.Number;
      }
      finally {
        stubs.restore();
      }


      // test 2: error handling
      try {
        yield container.containerSizeAsync();
        throw new Error('Should not get here');
      } catch (e) {
        e.message.should.eql(`Command failed: /bin/sh -c du -bs /var/lib/docker/aufs/diff/${container.containerId}\ndu: cannot access ‘/var/lib/docker/aufs/diff/${container.containerId}’: Permission denied\n`);
      }

    });
  });
});
