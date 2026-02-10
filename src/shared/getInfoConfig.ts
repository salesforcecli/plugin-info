/*
 * Copyright 2026, Salesforce, Inc.
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

import pathPkg from 'node:path';
import fs from 'node:fs/promises';
import { Interfaces } from '@oclif/core';

export type PjsonWithInfo = {
  oclif: Interfaces.PJSON['oclif'] & {
    info: InfoConfig;
  };
} & Interfaces.PJSON;

export type InfoConfig = {
  releasenotes: {
    distTagUrl: string;
    releaseNotesPath: string;
    releaseNotesFilename: string;
  };
};

/* sfdx example to add to cli pjson.oclif

example location with npm install:
~/.nvm/versions/node/v14.17.5/lib/node_modules/sfdx-cli/package.json

Add to oclif object
"info": {
  "releasenotes": {
    "distTagUrl": "https://registry.npmjs.org/-/package/sfdx-cli/dist-tags",
    "releaseNotesPath": "https://github.com/forcedotcom/cli/tree/main/releasenotes/sfdx",
    "releaseNotesFilename": "README.md"
  }
}
*/

export const getInfoConfig = async (path: string): Promise<InfoConfig> => {
  // TODO: could add env var support for these values
  const fullPath = pathPkg.join(path, 'package.json');

  const json = JSON.parse(await fs.readFile(fullPath, 'utf8')) as PjsonWithInfo;

  const { info } = json.oclif;

  if (!info) throw new Error('getInfoConfig() failed to find pjson.oclif.info config');

  return info;
};

export default { getInfoConfig };
