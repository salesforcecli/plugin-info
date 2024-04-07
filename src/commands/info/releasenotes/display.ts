/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { EOL } from 'node:os';

import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { Env } from '@salesforce/kit';
import { Flags, SfCommand, loglevel } from '@salesforce/sf-plugins-core';
import { Lifecycle, Logger, Messages } from '@salesforce/core';
import type { AnyJson, JsonMap } from '@salesforce/ts-types';
import shared from '../../../shared/index.js';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);

const helpers = ['stable', 'stable-rc', 'latest', 'latest-rc', 'rc'];

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('@salesforce/plugin-info', 'display');

export default class Display extends SfCommand<DisplayOutput | undefined> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');

  public static readonly aliases = ['whatsnew'];

  public static readonly examples = messages.getMessages('examples', [helpers.join(', ')]);

  public static readonly flags = {
    version: Flags.string({
      char: 'v',
      summary: messages.getMessage('flags.version.summary'),
    }),
    hook: Flags.boolean({
      hidden: true,
      summary: messages.getMessage('flags.hook.summary'),
    }),
    loglevel,
  };

  public async run(): Promise<DisplayOutput | undefined> {
    const HIDE_NOTES = this.config.bin === 'sf' ? 'SF_HIDE_RELEASE_NOTES' : 'SFDX_HIDE_RELEASE_NOTES';
    const HIDE_FOOTER = this.config.bin === 'sf' ? 'SF_HIDE_RELEASE_NOTES_FOOTER' : 'SFDX_HIDE_RELEASE_NOTES_FOOTER';

    const logger = Logger.childFromRoot(this.constructor.name);
    const { flags } = await this.parse(Display);
    const env = new Env();

    if (env.getBoolean(HIDE_NOTES) && flags.hook) {
      // We don't ever want to exit the process for info:releasenotes:display (whatsnew)
      // In most cases we will log a message, but here we only trace log in case someone using stdout of the update command
      logger.trace(`release notes disabled via env var: ${HIDE_NOTES}`);
      logger.trace('exiting');
      await Lifecycle.getInstance().emitTelemetry({ eventName: 'NOTES_HIDDEN' });

      return;
    }

    try {
      const installedVersion = this.config.pjson.version;

      const infoConfig = await shared.getInfoConfig(this.config.root);

      const { distTagUrl, releaseNotesPath, releaseNotesFilename } = infoConfig.releasenotes;

      let version = flags.version ?? installedVersion;

      if (helpers.includes(version)) {
        version = await shared.getDistTagVersion(distTagUrl, version);
      }

      const releaseNotes = await shared.getReleaseNotes(releaseNotesPath, releaseNotesFilename, version);

      const tokens = shared.parseReleaseNotes(releaseNotes, version, releaseNotesPath);

      marked.setOptions({
        renderer: new TerminalRenderer({ emoji: false }),
      });

      tokens.unshift(marked.lexer(`# Release notes for '${this.config.bin}':`)[0]);

      if (flags.json) {
        const body = tokens.map((token) => token.raw).join(EOL);

        return { body, url: releaseNotesPath };
      } else {
        this.log(marked.parser(tokens));
      }

      if (flags.hook) {
        if (env.getBoolean(HIDE_FOOTER)) {
          await Lifecycle.getInstance().emitTelemetry({ eventName: 'FOOTER_HIDDEN' });
        } else {
          const footer = messages.getMessage('footer', [this.config.bin, releaseNotesPath, HIDE_NOTES, HIDE_FOOTER]);
          this.log(marked.parse(footer));
        }
      }
    } catch (err) {
      if (flags.hook) {
        // Do not throw error if --hook is passed, just warn so we don't exit any processes.
        // --hook is passed in the post install/update scripts
        const { message, stack, name } = err as Error;

        this.warn(`${this.id} failed: ${message}`);

        logger.trace(stack);
        await Lifecycle.getInstance().emitTelemetry({
          eventName: 'COMMAND_ERROR',
          type: 'EXCEPTION',
          errorName: name,
          errorMessage: message,
          Error: Object.assign(
            {
              name,
              message,
              stack,
            } as JsonMap,
            err
          ) as AnyJson,
        });

        return;
      }

      throw err;
    }
  }
}

export type DisplayOutput = {
  body: string;
  url: string;
}
