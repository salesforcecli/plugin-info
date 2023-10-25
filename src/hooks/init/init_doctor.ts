/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import type { Hook } from '@oclif/core';
import { Doctor } from '../../doctor.js';

const hook: Hook<'init'> = async ({ config, id }): Promise<void> => {
  if (id === 'doctor' && !Doctor.isDoctorEnabled()) {
    Doctor.init(config);
  }

  return Promise.resolve();
};

export default hook;
