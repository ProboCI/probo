var path = require('path'),
    fs = require('fs'),
    wordwrap = require('wordwrap'),
    windowsize = require('window-size');

var exports = function() {
  this.configure = this.configure.bind(this);
  this.yargs = this.yargs.bind(this);
  this.run = this.run.bind(this);
};

exports.shortDescription = 'Displays this help message.'

exports.options = function(yargs) {
  this.yargs = yargs;
};

exports.configure = function(config) {
};

exports.buildSpaces = function(number) {
  var output = '';
  for (var i = 0 ; i < number ; i++) {
    output += ' ';
  }
  return output;
};

exports.buildAllCommandHelp = function(amour, done) {
  amour.cli.loadCommands(function(error, commands) {
    if (error) return done(error);
    var output = [];
    var name = '';
    for (name in commands) {
      var command = commands[name];
      if (command.shortDescription) {
        var element = {
          name: name,
          description: command.shortDescription
        };
        output.push(element);
      }
    }
    if (done) {
      done(null, output);
    }
  });
}

exports.run = function(amour) {
  var self = this;
  var argv = this.yargs.argv;
  if (argv._[1]) {
    var includePath = path.join(__dirname, 'amour-' + argv._[1] + '.js');
    if (!fs.existsSync(includePath)) {
      console.error('ERROR: Unknown command `' + argv._[1] + '`\n');
    }
    else {
      var executor = require(includePath);
      if (executor.options) {
        executor.options(this.yargs);
      }
    }
  }
  else {
    this.buildAllCommandHelp(amour, function(error, output) {
      if (error) throw error;
      var spaces = 30;
      console.log('usage: amour [--config] <command> [<args>]');
      console.log('');
      console.log('The available subcommands are:');
      output = output.map(function(element) { 
        var name = element.name
        var output =  '    ' + name + self.buildSpaces(spaces - name.length);
        var wrap = wordwrap(output.length, windowsize.width);
        var description = wrap(element.description);
        output += description.substring(output.length);
        return output;
      });
      console.log(output.join('\n'));
      console.log('');
      console.log('For more specific help see \'amour help <subcommand>\'');
    });
  }
}

module.exports = exports;
