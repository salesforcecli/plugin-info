module.exports = {
  commandDescription: 'display CLI release notes on the command line',
  flags: {
    version: 'display release notes for this version',
    hook: 'hidden flag used after install or update, will suppress errors',
  },
  examples: [
    `<%= config.bin %> <%= command.id %>
  display release notes for currently installed CLI

<%= config.bin %> <%= command.id %> --version "1.2.3"
  display release notes for CLI version 1.2.3

<%= config.bin %> <%= command.id %> --version "stable-rc"
  can be called with tag "helpers", available options are: %s`,
  ],
  footer: `---
 Release notes can be displayed at any point by running \`%s whatsnew\`

 They can also be viewed on GitHub by visiting the [forcedotcom/cli](%s) repo

 Silence notes by setting the \`%s\` env var to \`true\`

 Hide this footer by setting \`%s\` to \`true\`

---`,
};
