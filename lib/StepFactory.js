'use strict';

class StepFactory {

  /**
   * @param {Object} options - An object containing configuration options.
   * @param {Build} options.build - The build to provide to instantiated steps.
   * @param {Container} options.container - The container to provide to instantiated steps.
   * @param {Object} options.stepPlugins - An object containing step plugin keyed by plugin name.
   */
  constructor(options) {
    options = options || {};
    this.build = options.build;
    this.container = options.container;
    this.stepPlugins = options.stepPlugins || [];
  }

  createStepsFromConfig(stepConfigs) {
    var loadedSteps = [];
    for (let conf of stepConfigs) {
      loadedSteps.push(this.createStepFromConfig(conf));
    }
    return loadedSteps;
  }

  createStepFromConfig(stepConfig) {
    var pluginName = stepConfig.plugin || stepConfig.type || 'Shell';
    if (!this.stepPlugins[pluginName]) {
      throw new Error(`${pluginName} is not a valid step plugin.`);
    }
    var Step = this.stepPlugins[pluginName];
    stepConfig.build = this.build;

    // TODO: It would be great to find a clever way not to special case this.
    if (pluginName === 'StepList') {
      stepConfig.steps = this.createStepsFromConfig(stepConfig.steps);
    }
    return new Step(this.container, stepConfig, this.build);
  }

}

module.exports = StepFactory;
