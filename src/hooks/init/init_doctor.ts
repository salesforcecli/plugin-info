/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import type { Hook } from '@oclif/core';
import { Logger } from '@salesforce/core';
import { Doctor } from '../../doctor';

const log = Logger.childFromRoot('plugin-info:init_doctor');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const hook: Hook<'init'> = async ({ config, argv, id }): Promise<void> => {
  log.debug('init_doctor hook');
  if (id === 'doctor') {
    if (!Doctor.isDoctorEnabled()) {
      Doctor.init(config);
    }
  }

  return Promise.resolve();
};

export default hook;
