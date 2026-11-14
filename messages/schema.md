# summary

Display the schema for a CLI command, including its flags, args, and requirements.

# description

Outputs a JSON schema describing a command's input interface: flags with types and validation constraints, args, org/project requirements, and error codes. Designed for programmatic consumption by agents and tools.

When run without the --command flag, outputs a compact index of all available commands with their requirements.

# flags.command.summary

The command to describe (e.g. "org list" or "org:list").

# examples

- Display the schema for the "org list" command:

  <%= config.bin %> <%= command.id %> --command "org list"

- Display an index of all available commands:

  <%= config.bin %> <%= command.id %>

# error.commandNotFound

Command "%s" not found. Run "sf schema" to list all available commands.
