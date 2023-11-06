/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
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
