/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { getDistTagVersion } from './getDistTagVersion.js';
import { getInfoConfig } from './getInfoConfig.js';
import { getReleaseNotes } from './getReleaseNotes.js';
import { parseReleaseNotes } from './parseReleaseNotes.js';

export default {
  getDistTagVersion,
  getInfoConfig,
  getReleaseNotes,
  parseReleaseNotes,
};
