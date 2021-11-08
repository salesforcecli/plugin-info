/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

// Needed this to ensure the "helpers" were declared before read in examples
/* eslint-disable @typescript-eslint/member-ordering */

import { marked } from 'marked';
import * as TerminalRenderer from 'marked-terminal';
import { Env } from '@salesforce/kit';
import { flags, SfdxCommand } from '@salesforce/command';
import { getString } from '@salesforce/ts-types';
import { Messages } from '@salesforce/core';

import { getInfoConfig, InfoConfig } from '../../../shared/get-info-config';
import { getReleaseNotes } from '../../../shared/get-release-notes';
import { getDistTagVersion } from '../../../shared/get-dist-tag-version';
import { parseReleaseNotes } from '../../../shared/parse-release-notes';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is sfdx using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('@salesforce/plugin-info', 'display');

export default class Display extends SfdxCommand {
  private static helpers = ['stable', 'stable-rc', 'latest', 'latest-rc', 'rc'];

  public static description = messages.getMessage('commandDescription');

  public static aliases = ['whatsnew'];

  public static examples = [
    `$ sfdx info:releasenotes:display
  display release notes for currently installed CLI version
  `,
    `$ sfdx info:releasenotes:display --version "1.2.3"
  display release notes for CLI version 1.2.3
  `,
    `$ sfdx info:releasenotes:display --version "stable-rc"
  can be called with tag "helpers", available options are: ${Display.helpers.join(', ')}
`,
  ];

  protected static flagsConfig = {
    version: flags.string({
      char: 'v',
      description: messages.getMessage('versionFlagDescription'),
    }),
  };

  public async run(): Promise<void> {
    if (new Env().getBoolean('PLUGIN_INFO_HIDE_RELEASE_NOTES')) {
      // We don't ever want to exit the process for info:releasenotes:display
      // In most cases we will log a message, but here we only trace log in case someone using stdout of the update command
      this.logger.trace('release notes disabled via env var: PLUGIN_INFO_HIDE_RELEASE_NOTES_ENV');
      this.logger.trace('exiting');

      return;
    }

    const warn = (msg: string, err): void => {
      this.ux.warn(`${msg}\n${getString(err, 'message')}`);
    };

    const installedVersion = this.config.pjson.version;

    let infoConfig: InfoConfig;

    try {
      infoConfig = await getInfoConfig(this.config.root);
    } catch (err) {
      warn('Loading plugin-info config from package.json failed with message:', err);
      return;
    }

    const { distTagUrl, releaseNotesPath, releaseNotesFilename } = infoConfig.releasenotes;

    let version = (this.flags.version as string) || installedVersion;

    if (Display.helpers.includes(version)) {
      try {
        version = await getDistTagVersion(distTagUrl, version);
      } catch (err) {
        warn('Getting dist-tag info failed with message:', err);
        return;
      }
    }

    let releaseNotes;

    try {
      releaseNotes = await getReleaseNotes(releaseNotesPath, releaseNotesFilename, version);
    } catch (err) {
      warn('getReleaseNotes() request failed with message:', err);
      return;
    }

    try {
      const tokens = parseReleaseNotes(releaseNotes, version, releaseNotesPath);

      marked.setOptions({
        renderer: new TerminalRenderer(),
      });

      this.ux.log(marked.parser(tokens));
    } catch (err) {
      warn('parseReleaseNotes() failed with message', err);
    }
  }
}
