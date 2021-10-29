/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { major } from 'semver';

export async function getReleaseNotes(base: string, filename: string, version: string): Promise<AxiosResponse> {
  const majorVersion = major(version);

  const options: AxiosRequestConfig = {
    timeout: 5000,
    validateStatus: () => true,
  };

  const getPromises = [
    axios.get<AxiosResponse>(`${base}/v${majorVersion}.md`, options),
    axios.get<AxiosResponse>(`${base}/${filename}`, options),
  ];

  const [versioned, readme] = await Promise.all(getPromises);

  const { data } = versioned.status === 200 ? versioned : readme;

  // check readme status too

  return data;
}
