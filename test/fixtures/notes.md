## 63.18.2 (September 17th, 2043)

- testing multiple minors (higher)

## 63.18.1 (September 17th, 2043)

- testing multiple minors (lower)

## 63.17.2 (September 10th, 2043)

- test for finding nearby versions
- `63.17.0` will show results for `63.17.2`
- `63.17.5` will show results for `63.17.2`

## 13.3.1 (Aug 3, 2023)

- test for matching full version (`3.3.1 !== 13.3.1`)

## 7.125.0 (Nov 4, 2021)

- testing a nested

  - list
  - with items
  - does this work
  - `source-foo-bar-wow`
  - `source_foo_bar_wow`
  - `source:foo:bar:wow`
  - huzzah

- NEW: We've greatly improved the source tracking commands, and we'd love you to try out the beta versions before we make them generally available.

  We're doing something different this time: rather than provide the beta commands in a separate plug-in, we're including them right in this release. The beta command names are similar to the existing ones, but are in the `force:source:beta` topic:

- `force:source:beta:pull`
- `force:source:beta:push`
- `force:source:beta:status`
- `force:source:beta:tracking:clear`
- `force:source:beta:tracking:reset`

  The existing commands, such as `force:source:pull`, continue to work as before. Check out [Source Tracking Beta](https://github.com/forcedotcom/cli/issues/1258) for additional details and gotchas.

## 7.123.0 (Oct 21, 2021)

- FIX: The `force:source:deploy|retrieve|convert|delete` commands support the `EclairGeoData` metadata type again.

- FIX: The `force:org:display --json` command displays in the JSON output the security warning about exposing sensitive information, consistent with the other commands. ([GitHub issue #1229](https://github.com/forcedotcom/cli/issues/1229))

- FIX: The `force:org:open` command correctly opens sandboxes in the `.mil` domain. Previously the command tried to open a different domain.

## 7.122.1 (Oct 14, 2021)

- NEW: The `force:source:deploy|retrieve|convert|delete` commands support these Slack-related metadata types that are new in the Winter '22 Salesforce release: `ViewDefinition` and `SlackApp`.

- FIX: The `force:source:deploy|retrieve|convert|delete` commands support the `SharingGuestRule` metadata type again. ([GitHub issue #1199](https://github.com/forcedotcom/cli/issues/1199))

- FIX: The `force:source:delete` command no longer fails when you try to delete metadata types that are in the org, but not in your local project directory. Previously you'd get the error `Entity of type MD-Type named MD-Type-Name cannot be found`. ([GitHub issue #1203](https://github.com/forcedotcom/cli/issues/1203))

## 7.121.8 (Oct 7, 2021)

- CHANGE: As we announced on [March 18, 2021](./README.md#5140-march-18-2021---cli-7920), the `--json` output of the `force:org:list` command no longer returns the property `connectedStatus` for scratch orgs. We've also removed the warning.
  - Testing [relative link](./test.md) in nested list
- FIX: When you delete a scratch org with the `force:org:delete` command, we now ensure that the associated Dev Hub org always deletes the corresponding record from the ActiveScratchOrg object. Previously, in certain circumstances, the record wasn't deleted, which could cause you to incorrectly exceed over your scratch org limit. ([GitHub issue #1155](https://github.com/forcedotcom/cli/issues/1155))
- FIX: The `force:source:convert` command correctly converts the `CustomFieldTranslation` metadata type.

## 7.120.0 (Sept 30, 2021)

- NEW: Some commands (`force:org:open`, `force:org:display`, `force:user:display`, `force:source:open`) display tokens and URLs with tokens embedded in them. They now include a warning about the risks of sharing that sensitive information.

- NEW: We've added a warning and additional information to explain why the command `force:source:retrieve -m CustomField` succeeds but returns no results, even when your org contains custom fields. This behavior is expected because the Metadata API never returns results if you retrieve the `CustomField` type on its own without also retrieving `CustomObject`. If you want to retrieve all your custom fields, try this command instead: `force:source:retrieve -m CustomField,CustomObject`.

  You get the same behavior if you run `force:source:retrieve -x manifest` and your manifest file contains a `CustomField` entry with an `*` to retrieve all custom fields, but no `CustomObject` entry. Check out the new warning for hints to actually retrieve your custom fields.

- NEW: Specify the level of deployment tests to run when you delete metadata source files with the new `--testlevel` parameter of `force:source:delete`. The new parameter works the same as the `--testlevel` parameter of `force:source:deploy`, although the list of valid values is shorter: `NoTestRun`, `RunLocalTests`, and `RunAllTestsInOrg`. See the [CLI Reference guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_force_source.htm#cli_reference_force_source_deploy) for more information about each value.

  For example, to run all org tests when you delete the MyMetadataType type from both your local project and the org, run this command:

  `sfdx force:source:delete --metadata MyMetadataType --testlevel RunAllTestsInOrg`

  As a result of this new feature, [GitHub issue #971](https://github.com/forcedotcom/cli/issues/971) is fixed.

- CHANGE: As we [warned last year](./v50.md#5020-october-22-2020---cli-7771), the `force:source:*` commands no longer support the old format of the `.forceignore` file. When parsing the `.forceignore` file, the commands now always use the same rules and patterns as [git uses with the `.gitignore` file](https://git-scm.com/docs/gitignore).

- FIX: The `force:source:deploy|retrieve|convert` commands now support the Reports, Dashboards, Documents, and EmailTemplates metadata types when they're nested in directories of more than one level. (GitHub issues [#1112](https://github.com/forcedotcom/cli/issues/1112) and [#1173](https://github.com/forcedotcom/cli/issues/1173))

- FIX: The `force:source:deploy` command provides more failure details in situations where it previously reported the un-helpful `Deploy Failed`

- FIX: The `force:org:create` command now uses only polling, and not the Streaming API, to listen for updates about the scratch org creation. As a result, you no longer get the error `Socket timeout occurred while listening for results` if the scratch org creation takes a long time. ([GitHub issue #1149](https://github.com/forcedotcom/cli/issues/1149))
