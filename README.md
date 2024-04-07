# plugin-info

[![NPM](https://img.shields.io/npm/v/@salesforce/plugin-info.svg?label=@salesforce/plugin-info)](https://www.npmjs.com/package/@salesforce/plugin-info) [![Downloads/week](https://img.shields.io/npm/dw/@salesforce/plugin-info.svg)](https://npmjs.org/package/@salesforce/plugin-info) [![License](https://img.shields.io/badge/License-BSD%203--Clause-brightgreen.svg)](https://raw.githubusercontent.com/salesforcecli/plugin-info/main/LICENSE.txt)

## Learn about the plugin-info

Salesforce CLI plugins are based on the [oclif plugin framework](https://oclif.io/docs/introduction). Read the [plugin developer guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_plugins.meta/sfdx_cli_plugins/cli_plugins_architecture_sf_cli.htm) to learn about Salesforce CLI plugin development.

This repository contains a lot of additional scripts and tools to help with general Salesforce node development and enforce coding standards. You should familiarize yourself with some of the [node developer packages](https://github.com/forcedotcom/sfdx-dev-packages/) used by Salesforce. There is also a default circleci config using the [release management orb](https://github.com/forcedotcom/npm-release-management-orb) standards.

Additionally, there are some additional tests that the Salesforce CLI will enforce if this plugin is ever bundled with the CLI. These test are included by default under the `posttest` script and it is recommended to keep these tests active in your plugin, regardless if you plan to have it bundled.

This plugin is bundled with the [Salesforce CLI](https://developer.salesforce.com/tools/sfdxcli). For more information on the CLI, read the [getting started guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_intro.htm).

We always recommend using the latest version of these commands bundled with the CLI, however, you can install a specific version or tag if needed.

## Install

```bash
sfdx plugins:install info@x.y.z
```

## Issues

Please report any issues at https://github.com/forcedotcom/cli/issues

## Contributing

1. Please read our [Code of Conduct](CODE_OF_CONDUCT.md)
2. Create a new issue before starting your project so that we can keep track of
   what you are trying to add/fix. That way, we can also offer suggestions or
   let you know if there is already an effort in progress.
3. Fork this repository.
4. [Build the plugin locally](#build)
5. Create a _topic_ branch in your fork. Note, this step is recommended but technically not required if contributing using a fork.
6. Edit the code in your fork.
7. Write appropriate tests for your changes. Try to achieve at least 95% code coverage on any new code. No pull request will be accepted without unit tests.
8. Sign CLA (see [CLA](#cla) below).
9. Send us a pull request when you are done. We'll review your code, suggest any needed changes, and merge it in.

### CLA

External contributors will be required to sign a Contributor's License
Agreement. You can do so by going to https://cla.salesforce.com/sign-cla.

### Build

To build the plugin locally, make sure to have yarn installed and run the following commands:

```bash
# Clone the repository
git clone git@github.com:salesforcecli/plugin-info

# Install the dependencies and compile
yarn install
yarn build
```

To use your plugin, run using the local `./bin/dev` or `./bin/dev.cmd` file.

```bash
# Run using local run file.
./bin/dev info
```

There should be no differences when running via the Salesforce CLI or using the local run file. However, it can be useful to link the plugin to do some additional testing or run your commands from anywhere on your machine.

```bash
# Link your plugin to the sfdx cli
sfdx plugins:link .
# To verify
sfdx plugins
```

## Commands

<!-- commands -->

- [`sf doctor`](#sf-doctor)
- [`sf info releasenotes display`](#sf-info-releasenotes-display)

## `sf doctor`

Gather CLI configuration data and run diagnostic tests to discover and report potential problems in your environment.

```
USAGE
  $ sf doctor [--json] [--flags-dir <value>] [-c <value>] [-p <value>] [-d <value>] [-i]

FLAGS
  -c, --command=<value>     Command to run in debug mode; results are written to a log file.
  -d, --output-dir=<value>  Directory to save all created files rather than the current working directory.
  -i, --create-issue        Create a new issue on our GitHub repo and attach all diagnostic results.
  -p, --plugin=<value>      Specific plugin on which to run diagnostics.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Gather CLI configuration data and run diagnostic tests to discover and report potential problems in your environment.

  When you run the doctor command without parameters, it first displays a diagnostic overview of your environment. It
  then writes a detailed diagnosis to a JSON file in the current directory. Use the --outputdir to specify a different
  directory. To run diagnostic tests on a specific plugin, use the --plugin parameter. If the plugin isn't listening to
  the doctor, then you get a warning.

  Use the --command parameter to run a specific command in debug mode; the doctor writes both stdout and stderr to
  \*.log files that you can provide to Salesforce Customer Support or attach to a GitHub issue.

  Plugin providers can also implement their own doctor diagnostic tests by listening to the "sf-doctor" event and
  running plugin specific tests that are then included in the doctor diagnostics log.

EXAMPLES
  Run CLI doctor diagnostics:

    $ sf doctor

  Run CLI doctor diagnostics and the specified command, and write the debug output to a file:

    $ sf doctor --command "force:org:list --all"

  Run CLI doctor diagnostics for a specific plugin:

    $ sf doctor --plugin @salesforce/plugin-source
```

_See code: [src/commands/doctor.ts](https://github.com/salesforcecli/plugin-info/blob/3.1.3/src/commands/doctor.ts)_

## `sf info releasenotes display`

Display Salesforce CLI release notes on the command line.

```
USAGE
  $ sf info releasenotes display [--json] [--flags-dir <value>] [-v <value>]

FLAGS
  -v, --version=<value>  CLI version or tag for which to display release notes.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Display Salesforce CLI release notes on the command line.

  By default, this command displays release notes for the currently installed CLI version on your computer. Use the
  --version flag to view release notes for a different release.

ALIASES
  $ sf whatsnew

EXAMPLES
  Display release notes for the currently installed CLI version:

    $ sf info releasenotes display stable, stable-rc, latest, latest-rc, rc

  Display release notes for CLI version 7.120.0:

    $ sf info releasenotes display --version 7.120.0 stable, stable-rc, latest, latest-rc, rc

  Display release notes for the CLI version that corresponds to a tag (stable, stable-rc, latest, latest-rc, rc):

    $ sf info releasenotes display --version latest
```

_See code: [src/commands/info/releasenotes/display.ts](https://github.com/salesforcecli/plugin-info/blob/3.1.3/src/commands/info/releasenotes/display.ts)_

<!-- commandsstop -->
