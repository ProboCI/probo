'use strict';

/**
 * Build the command and port exposing logic for starting a proboscis powered
 * container.
 *
 * This only takes care of the default services for the image defined by us.
 * @see `defaults.yaml`
 *
 * @param {Object.<string, any>} image - The image configuration.
 * @param {Object.<string, any>} image.services - The default services for the
 *   image.
 * @param {Object.<string, any>} buildConfig - The build configuration defined
 *   in the .probo.yaml file.
 * @return {Object.<string, any>} - The command info on what is to be run.
 */
const defaultCommandInfo = (image, buildConfig) => {
  if (!image) {
    throw new Error('Use an approved Probo Image in your .probo.yaml file. See https://docs.probo.ci/build/images/ for approved Probo Images.');
  }

  if (!image.services) {
    return emptyDefaultCommand(buildConfig);
  }

  let command = 'proboscis';
  let exposedPorts = {};
  let portBindings = {};

  for (let name in image.services) {
    if (image.services.hasOwnProperty(name)) {
      const service = image.services[name];

      command += ` -n ${name} -c "${service.command}"`;

      if (service.port) {
        const protocol = service.protocol || 'tcp';
        const portString = service.port + '/' + protocol;

        exposedPorts[portString] = {};
        portBindings[portString] = [{HostPort: null}];
      }
    }
  }

  // Exposes the configured site port or 80 if none is set by user.
  const port = buildConfig.sitePort ? buildConfig.sitePort : '80';
  exposedPorts[`${port}/tcp`] = {};
  portBindings[`${port}/tcp`] = [{HostPort: null}];

  return {
    command: command,
    exposedPorts: exposedPorts,
    portBindings: portBindings,
  };

};

const emptyDefaultCommand = buildConfig => {
  let options = {
    command: '',
    exposedPorts: {},
    portBindings: {},
  };

  const port = buildConfig.sitePort ? buildConfig.sitePort : '80';

  options.exposedPorts[`${port}/tcp`] = {};
  options.portBindings[`${port}/tcp`] = [{HostPort: null}];

  return options;
};

/**
 * Appends user-defined services to the default services for the image.
 *
 * @param {string} command - The current proboscis command.
 * @param {Object.<string, any>} services - The user-defined services to append.
 * @return {string} - The new proboscis command with the previous services +
 *   the new services.
 */
const appendServices = (command, services) => {

  if (!command) {
    command = 'proboscis';
  }

  for (let name in services) {
    if (services.hasOwnProperty(name)) {

      const service = services[name];

      command += ` -n ${name} -c "${service.command}"`;

    }
  }

  return command;
};

module.exports = {
  defaultCommandInfo,
  appendServices,
};
