/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

// Needed this to ensure the "helpers" were decalred before read in examples
/* eslint-disable @typescript-eslint/member-ordering */

import got from 'got';
import { Env } from '@salesforce/kit';
import { flags, SfdxCommand } from '@salesforce/command';
import { getString } from '@salesforce/ts-types';
import { Messages } from '@salesforce/core';

import { getInfoConfig, InfoConfig } from '../../../shared/get-info-config';
import { getReleaseNotes } from '../../../shared/get-release-notes';

import { PLUGIN_INFO_GET_TIMEOUT } from '../../../constants';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is sfdxusing the messages framework can also be loaded this way.
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
      this.logger.trace('release notes disabled via env var: PLUGIN_INFO_HIDE_RELEASE_NOTES_ENV');
      this.logger.trace('exiting');

      return;
    }

    const installedVersion = this.config.pjson.version;

    let infoConfig: InfoConfig;

    try {
      infoConfig = await getInfoConfig(this.config.root);
    } catch (err) {
      const msg = getString(err, 'message');

      this.ux.warn(`Loading plugin-info config from package.json failed with message:\n${msg}`);

      return;
    }

    const { distTagUrl, releaseNotesPath, releaseNotesFilename } = infoConfig.releasenotes;

    let version = (this.flags.version as string) || installedVersion;

    if (Display.helpers.includes(version)) {
      try {
        const options = { timeout: PLUGIN_INFO_GET_TIMEOUT };

        type DistTagJson = {
          latest: string;
          'latest-rc': string;
        };

        const body = await got(distTagUrl, options).json<DistTagJson>();

        version = version.includes('rc') ? body['latest-rc'] : body['latest'];
      } catch (err) {
        // TODO: Could fallback up using npm here? That way private cli repos could auth with .npmrc
        // -- could use this: https://github.com/salesforcecli/plugin-trust/blob/0393b906a30e8858816625517eda5db69377c178/src/lib/npmCommand.ts
        this.ux.warn(`Was not able to look up dist-tags from ${distTagUrl}. Try using a version instead.`);

        return;
      }
    }

    let releaseNotes;

    try {
      releaseNotes = await getReleaseNotes(releaseNotesPath, releaseNotesFilename, version);
    } catch (err) {
      const msg = getString(err, 'message');

      this.ux.warn(`getReleaseNotes() request failed with message:\n${msg}`);

      return;
    }

    // temp until markdown parser is added
    this.ux.log(releaseNotes);
  }
}
