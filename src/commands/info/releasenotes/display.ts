/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

// Needed this to ensure the "helpers" were declared before read in examples
/* eslint-disable @typescript-eslint/member-ordering */

import * as os from 'os';
import { marked } from 'marked';
import * as TerminalRenderer from 'marked-terminal';
import { Env } from '@salesforce/kit';
import { flags, SfdxCommand } from '@salesforce/command';
import { Messages } from '@salesforce/core';
import { getInfoConfig } from '../../../shared/getInfoConfig';
import { getReleaseNotes } from '../../../shared/getReleaseNotes';
import { getDistTagVersion } from '../../../shared/getDistTagVersion';
import { parseReleaseNotes } from '../../../shared/parseReleaseNotes';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

const HIDE_NOTES = 'PLUGIN_INFO_HIDE_RELEASE_NOTES';
const HIDE_FOOTER = 'PLUGIN_INFO_HIDE_FOOTER';

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('@salesforce/plugin-info', 'display');

export default class Display extends SfdxCommand {
  private static helpers = ['stable', 'stable-rc', 'latest', 'latest-rc', 'rc'];

  public static description = messages.getMessage('commandDescription');

  public static aliases = ['whatsnew'];

  public static examples = messages.getMessage('examples', [Display.helpers.join('", "')]).split(os.EOL);

  protected static flagsConfig = {
    version: flags.string({
      char: 'v',
      description: messages.getMessage('flags.version'),
    }),
    hook: flags.boolean({
      hidden: true,
      description: messages.getMessage('flags.hook'),
    }),
  };

  public async run(): Promise<void> {
    const env = new Env();

    if (env.getBoolean(HIDE_NOTES)) {
      // We don't ever want to exit the process for info:releasenotes:display (whatsnew)
      // In most cases we will log a message, but here we only trace log in case someone using stdout of the update command
      this.logger.trace(`release notes disabled via env var: ${HIDE_NOTES}`);
      this.logger.trace('exiting');

      return;
    }

    const isHook = !!this.flags.hook;

    try {
      const installedVersion = this.config.pjson.version;

      const infoConfig = await getInfoConfig(this.config.root);

      const { distTagUrl, releaseNotesPath, releaseNotesFilename } = infoConfig.releasenotes;

      let version = (this.flags.version as string) ?? installedVersion;

      if (Display.helpers.includes(version)) {
        version = await getDistTagVersion(distTagUrl, version);
      }

      const releaseNotes = await getReleaseNotes(releaseNotesPath, releaseNotesFilename, version);

      const tokens = parseReleaseNotes(releaseNotes, version, releaseNotesPath);

      marked.setOptions({
        renderer: new TerminalRenderer(),
      });

      this.ux.log(marked.parser(tokens));

      if (isHook && !env.getBoolean(HIDE_FOOTER)) {
        const footer = messages.getMessage('footer', [this.config.bin, releaseNotesPath, HIDE_NOTES, HIDE_FOOTER]);

        this.ux.log(marked.parse(footer));
      }
    } catch (err) {
      if (isHook) {
        // Do not throw error if --hook is passed, just warn so we don't exit any processes.
        // --hook is passed in the post install/update scripts
        const { message, stack } = err as Error;

        this.ux.warn(`${this.id} failed: ${message}`);

        this.logger.trace(stack);

        return;
      }

      throw err;
    }
  }
}
