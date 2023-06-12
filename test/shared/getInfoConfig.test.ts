/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as pathPkg from 'path';
import * as fs from 'fs';
import { expect, use as chaiUse, assert } from 'chai';
import * as Sinon from 'sinon';
import * as SinonChai from 'sinon-chai';
import { stubMethod, spyMethod } from '@salesforce/ts-sinon';
import { shouldThrow } from '@salesforce/core/lib/testSetup';
import { getInfoConfig, PjsonWithInfo } from '../../src/shared/getInfoConfig';

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
