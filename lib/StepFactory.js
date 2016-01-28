'use strict';

class StepFactory {

  /**
   * @param {Object} options - An object containing configuration options.
   * @param {Build} options.build - The build to provide to instantiated steps.
   * @param {Container} options.container - The container to provide to instantiated steps.
   * @param {Object} options.steps - An object containing step plugin keyed by plugin name.
   */
  constructor(options) {
    options = options || {};
    this.build = options.build;
    this.container = options.container;
    this.steps = options.steps || [];
  }

  createStepsFromConfig(stepConfig) {
    var loadedSteps = [];
    for (let conf of stepConfig) {
      let pluginName = conf.plugin || conf.type;
      let Step = this.steps[pluginName];
      conf.build = this.build;
      if (pluginName === 'StepList') {
        conf.steps = this.createStepsFromConfig(conf.steps);
      }
      loadedSteps.push(new Step(this.container, conf, this.build));
    }
    return loadedSteps;
  }

}

module.exports = StepFactory;
