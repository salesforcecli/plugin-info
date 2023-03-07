/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import type { Hook } from '@oclif/core';
import { Logger } from '@salesforce/core';
import { VersionCommand } from '@oclif/plugin-version';
import { Doctor } from '../../doctor';

const log = Logger.childFromRoot('plugin-plugin-info:init_doctor');
const hook: Hook<'init'> = async ({ config }): Promise<void> => {
  log.debug('init_doctor hook');
  if (process.argv[2] === 'doctor') {
    // The doctor command requires CLI version details obtained from the CLI's oclif config.
    const versionDetail = await VersionCommand.run(['--verbose', '--json']);
    if (!Doctor.isDoctorEnabled()) {
      Doctor.init(config, versionDetail);
    }
  }

  return Promise.resolve();
};

export default hook;
