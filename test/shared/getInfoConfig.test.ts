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
import fs from 'node:fs';
import { expect, use as chaiUse, assert } from 'chai';
import Sinon from 'sinon';
import SinonChai from 'sinon-chai';
import { stubMethod, spyMethod } from '@salesforce/ts-sinon';
import { shouldThrow } from '@salesforce/core/testSetup';
import { getInfoConfig, PjsonWithInfo } from '../../src/shared/getInfoConfig.js';

chaiUse(SinonChai);

describe('getInfoConfig tests', () => {
  const sandbox = Sinon.createSandbox();

  let readFileStub: Sinon.SinonStub;
  let joinSpy: Sinon.SinonSpy;

  let pjsonMock: PjsonWithInfo;

  const path = 'path/to';

  beforeEach(() => {
    pjsonMock = {
      name: 'testing',
      version: '1.2.3',
      oclif: {
        info: {
          releasenotes: {
            distTagUrl: 'https://registry.npmjs.org/-/package/sfdx-cli/dist-tags',
            releaseNotesPath: 'https://github.com/forcedotcom/cli/tree/main/releasenotes/sfdx',
            releaseNotesFilename: 'README.md',
          },
        },
      },
    } as PjsonWithInfo;

    // keep pjsonMock as JSON to access values in tests
    readFileStub = stubMethod(sandbox, fs.promises, 'readFile').resolves(JSON.stringify(pjsonMock));
    joinSpy = spyMethod(sandbox, pathPkg, 'join');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('join is called with path arg and package.json', async () => {
    await getInfoConfig(path);

    const expected = pathPkg.join(path, 'package.json');

    expect(joinSpy.args[0]).to.deep.equal([path, 'package.json']);
    expect(joinSpy.returnValues[0]).to.equal(expected);
  });

  it('calls readJson with pjson path', async () => {
    await getInfoConfig(path);

    const expected = pathPkg.join(path, 'package.json');

    expect(readFileStub.args[0][0]).to.deep.equal(expected);
  });

  it('info config is extracted from package.json', async () => {
    const info = await getInfoConfig(path);
    expect(info).to.deep.equal(pjsonMock.oclif.info);
  });

  it('throws an error if info config does not exist', async () => {
    readFileStub.returns(JSON.stringify({ oclif: {} }));

    try {
      await shouldThrow(getInfoConfig(path));
    } catch (err) {
      assert(err instanceof Error);
      expect(err.message).to.equal('getInfoConfig() failed to find pjson.oclif.info config');
    }
  });
});
