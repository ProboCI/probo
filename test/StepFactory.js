'use strict';

var should = require('should');
var TestStep = require('./fixtures/TestStep');
var MockContainer = require('./fixtures/MockContainer');
var lib = require('..');

var StepFactory = lib.StepFactory;
var Build = lib.Build;
var stepPlugins = lib.plugins.Step;

// Add our testing mock step as a plugin.
stepPlugins.TestStep = TestStep;

describe('StepFactory', function() {
  it('should instantiate steps based on provided step configuration', function() {
    var container = new MockContainer();
    var build = new Build();
    var stepFactory = new StepFactory({stepPlugins, container, build});
    var stepConf = [
      {
        name: 'Some Step',
        plugin: 'TestStep',
      },
    ];
    var result = stepFactory.createStepsFromConfig(stepConf);
    should.exist(result);
    result[0].name.should.equal('Some Step');
    result[0].constructor.should.equal(stepPlugins.TestStep);
    result[0].build.should.equal(build);
    result[0].container.should.equal(container);
  });
  it('should alias plugin and type to look up the plugin configuraiton', function() {
    var container = new MockContainer();
    var stepFactory = new StepFactory({stepPlugins, container});
    var stepConf = [
      {
        name: 'Step 1',
        type: 'TestStep',
      },
      {
        name: 'Step 2',
        plugin: 'TestStep',
      },
    ];
    var result = stepFactory.createStepsFromConfig(stepConf);
    should.exist(result);
    result[0].name.should.equal('Step 1');
    result[1].name.should.equal('Step 2');
  });
  it('should handle an empty list', function() {
    var stepFactory = new StepFactory();
    var result = stepFactory.createStepsFromConfig([]);
    result.length.should.equal(0);
  });
  it('should handle nested StepList definitions', function() {
    var container = new MockContainer();
    var build = new Build();
    var stepConf = [
      {
        type: 'StepList',
        steps: [
          {
            type: 'Shell',
            command: 'echo "Disco Stu Loves Disco Music"',
          },
          {
            type: 'StepList',
            steps: [
              {
                type: 'Script',
                script: ['echo hello there!'],
              },
            ],
          },
        ],
      },
    ];
    var stepFactory = new StepFactory({stepPlugins, container, build});
    var result = stepFactory.createStepsFromConfig(stepConf);
    result[0].constructor.should.equal(stepPlugins.StepList);
    result[0].steps[0].constructor.should.equal(stepPlugins.Shell);
    result[0].steps[0].options.command.should.containEql('Disco Stu');
    result[0].steps[1].steps[0].constructor.should.equal(stepPlugins.Script);
    result[0].steps[1].steps[0].options.script[0].should.containEql('hello');
  });
  it('should gracefully handle non-existent steps', function() {
    var container = new MockContainer();
    var build = new Build();
    var stepFactory = new StepFactory({stepPlugins, container, build});
    try {
      var result = stepFactory.createStepsFromConfig([{type: 'Nonsense'}]);
      should.not.exist(result);
    }
    catch (e) {
      e.message.should.equal('Nonsense is not a valid step plugin.');
    }
  });
  it('should default the plugin to `Shell`', function() {
    var container = new MockContainer();
    var build = new Build();
    var stepFactory = new StepFactory({stepPlugins, container, build});
    var result = stepFactory.createStepsFromConfig([{command: 'echo "this is it"'}]);
    result[0].constructor.should.equal(stepPlugins.Shell);
    result[0].options.command.should.equal('echo "this is it"');
  });
});

