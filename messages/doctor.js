module.exports = {
  commandDescription: `Run the CLI doctor, which gathers CLI configuration data and runs diagnostic tests to discover and report potential problems in your environment.

The doctor can run a command for you in debug mode, writing both stdout and stderr to files that you can provide to Salesforce Support or attach to GitHub issues.

The doctor can create a new GitHub issue for the Salesforce CLI, attaching all doctor diagnostic results and command debug files.

Plugin providers can also implement their own doctor diagnostic tests by listening to the "sf-doctor" event and running plugin specific tests that will be included in the doctor diagnostics log.
`,
  flags: {
    command: 'run the specified command in debug mode and write results to a file.',
    newissue: 'create a new GitHub issue for the CLI, attaching doctor diagnostic results.',
    plugin: 'run doctor command diagnostics for a specific plugin.',
    outputdir: 'directory to save all created files rather than the current working directory',
  },
  examples: [
    `Run CLI doctor diagnostics:
    $ <%= config.bin %> doctor
Run CLI doctor diagnostics and the specified command, writing debug output to a file:
    $ <%= config.bin %> doctor --command "force:org:list --all"
Run CLI doctor diagnostics for a specific plugin:
    $ <%= config.bin %> doctor --plugin @salesforce/plugin-source
Run CLI doctor diagnostics and create a new CLI GitHub issue, attaching all doctor diagnostics:
    $ <%= config.bin %> doctor --newissue
  `,
  ],
  pinnedSuggestions: {
    checkGitHubIssues: 'check https://github.com/forcedotcom/cli/issues for community posted CLI issues',
    checkSfdcStatus: 'check http://status.salesforce.com for any Salesforce announced problems',
  },
  doctorNotInitializedError: 'Must first initialize a new SfDoctor',
  doctorAlreadyInitializedError: 'SfDoctor has already been initialized',
  pluginNotInstalledError:
    'Specified plugin [%s] is not installed. Please install it, correct the name, or choose another plugin.',
};
