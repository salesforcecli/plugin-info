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
import { ProxyAgent } from 'proxy-agent';
import { SFDX_RELEASE_NOTES_TIMEOUT } from '../constants.js';

export type DistTagJson = {
  latest: string;
  'latest-rc': string;
};

export const getDistTagVersion = async (url: string, distTag: string): Promise<string> => {
  // TODO: Could use npm instead here. That way private cli repos could auth with .npmrc
  // -- could utilize this: https://github.com/salesforcecli/plugin-trust/blob/0393b906a30e8858816625517eda5db69377c178/src/lib/npmCommand.ts
  const options = {
    timeout: { request: SFDX_RELEASE_NOTES_TIMEOUT },
    agent: { https: new ProxyAgent() },
  };

  const body = await got.get(url, options).json<DistTagJson>();

  // We are only interested in latest and latest-rc, could update this if other tags are desired
  return distTag.includes('rc') ? body['latest-rc'] : body['latest'];
};

export default { getDistTagVersion };
