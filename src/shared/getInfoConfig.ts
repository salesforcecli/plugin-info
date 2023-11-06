/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import pathPkg from 'node:path';
import fs from 'node:fs/promises';
import { Interfaces } from '@oclif/core';

export interface PjsonWithInfo extends Interfaces.PJSON {
  oclif: Interfaces.PJSON['oclif'] & {
    info: InfoConfig;
  };
}

export interface InfoConfig {
  releasenotes: {
    distTagUrl: string;
    releaseNotesPath: string;
    releaseNotesFilename: string;
  };
}

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
