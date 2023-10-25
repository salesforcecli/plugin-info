# summary

Gather CLI configuration data and run diagnostic tests to discover and report potential problems in your environment.

# description

When you run the doctor command without parameters, it first displays a diagnostic overview of your environment. It then writes a detailed diagnosis to a JSON file in the current directory. Use the --outputdir to specify a different directory. To run diagnostic tests on a specific plugin, use the --plugin parameter. If the plugin isn't listening to the doctor, then you get a warning.

Use the --command parameter to run a specific command in debug mode; the doctor writes both stdout and stderr to \*.log files that you can provide to Salesforce Customer Support or attach to a GitHub issue.

Plugin providers can also implement their own doctor diagnostic tests by listening to the "sf-doctor" event and running plugin specific tests that are then included in the doctor diagnostics log.

# flags.command.summary

Command to run in debug mode; results are written to a log file.

# flags.plugin.summary

Specific plugin on which to run diagnostics.

# flags.output-dir.summary

Directory to save all created files rather than the current working directory.

# flags.create-issue.summary

Create a new issue on our GitHub repo and attach all diagnostic results.

# examples

- Run CLI doctor diagnostics:

  <%= config.bin %> doctor

- Run CLI doctor diagnostics and the specified command, and write the debug output to a file:

  <%= config.bin %> doctor --command "force:org:list --all"

- Run CLI doctor diagnostics for a specific plugin:

  <%= config.bin %> doctor --plugin @salesforce/plugin-source

# pinnedSuggestions.checkGitHubIssues

Check https://github.com/forcedotcom/cli/issues for CLI issues posted by the community.

# pinnedSuggestions.checkSfdcStatus

Check http://status.salesforce.com for general Salesforce availability and performance.

# doctorNotInitializedError

Must first initialize a new SfDoctor.

# pluginNotInstalledError

Specified plugin [%s] isn't installed. Install it, correct the name, or choose another plugin.
