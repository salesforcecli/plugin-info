/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import got from 'got';
import { major } from 'semver';
import { PLUGIN_INFO_GET_TIMEOUT } from '../constants';

export async function getReleaseNotes(base: string, filename: string, version: string): Promise<string> {
  const majorVersion = major(version);

  const options = {
    timeout: PLUGIN_INFO_GET_TIMEOUT,
    throwHttpErrors: false,
  };

  const getPromises = [
    got(`${base}/v${majorVersion}.md`, options),
    got(`${base}/${filename}`, { ...options, throwHttpErrors: true }),
  ];

  const [versioned, readme] = await Promise.all(getPromises);

  const { body } = versioned.statusCode === 200 ? versioned : readme;

  return body;
}
