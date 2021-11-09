module.exports = {
  commandDescription: 'display CLI release notes on the command line',
  flags: {
    version: 'display release notes for this version',
  },
  examples: [
    `<%= config.bin %> <%= command.id %>
  display release notes for currently installed CLI

<%= config.bin %> <%= command.id %> --version "1.2.3"
  display release notes for CLI version 1.2.3

<%= config.bin %> <%= command.id %> --version "stable-rc"
  can be called with tag "helpers", available options are: %s`,
  ],
};
