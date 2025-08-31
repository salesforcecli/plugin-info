/*
 * Copyright 2025, Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import got from 'got';
import semver from 'semver';
import { ProxyAgent } from 'proxy-agent';
import { SFDX_RELEASE_NOTES_TIMEOUT } from '../constants.js';

export const getReleaseNotes = async (base: string, filename: string, version: string): Promise<string> => {
  const majorVersion = semver.major(version);

  const rawBase = base.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/').replace('/tree/', '/');

  const options = {
    timeout: { request: SFDX_RELEASE_NOTES_TIMEOUT },
    throwHttpErrors: false,
    agent: { https: new ProxyAgent() },
  };

  const getPromises = [
    got.get(`${rawBase}/v${majorVersion}.md`, options),
    got.get(`${rawBase}/${filename}`, { ...options, throwHttpErrors: true }),
  ];

  const [versioned, readme] = await Promise.all(getPromises);

  const { body } = versioned.statusCode === 200 ? versioned : readme;

  return body;
};

export default { getReleaseNotes };
