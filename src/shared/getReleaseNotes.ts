/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import got from 'got';
import { major } from 'semver';
import { PLUGIN_INFO_GET_TIMEOUT } from '../constants';

const getReleaseNotes = async (base: string, filename: string, version: string): Promise<string> => {
  const majorVersion = major(version);

  const rawBase = base.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/').replace('/tree/', '/');

  const options = {
    timeout: PLUGIN_INFO_GET_TIMEOUT,
    throwHttpErrors: false,
  };

  const getPromises = [
    got(`${rawBase}/v${majorVersion}.md`, options),
    got(`${rawBase}/${filename}`, { ...options, throwHttpErrors: true }),
  ];

  const [versioned, readme] = await Promise.all(getPromises);

  const { body } = versioned.statusCode === 200 ? versioned : readme;

  return body;
};

export { getReleaseNotes };
