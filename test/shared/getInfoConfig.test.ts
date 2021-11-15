/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as pathPkg from 'path';
import { expect, use as chaiUse } from 'chai';
import * as Sinon from 'sinon';
import * as SinonChai from 'sinon-chai';
import { stubMethod, spyMethod } from '@salesforce/ts-sinon';
import { fs } from '@salesforce/core';
import { getInfoConfig, PjsonWithInfo } from '../../src/shared/getInfoConfig';

chaiUse(SinonChai);

describe('getInfoConfig tests', () => {
  const sandbox = Sinon.createSandbox();

  let readJsonStub: Sinon.SinonStub;
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
            releaseNotesPath: 'https://raw.githubusercontent.com/forcedotcom/cli/main/releasenotes/sfdx',
            releaseNotesFilename: 'README.md',
          },
        },
      },
    };

    readJsonStub = stubMethod(sandbox, fs, 'readJson').returns(pjsonMock);
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

    expect(readJsonStub.args[0][0]).to.deep.equal(expected);
  });

  it('info config is extracted from package.json', async () => {
    const info = await getInfoConfig(path);

    expect(info).to.deep.equal(pjsonMock.oclif.info);
  });

  it('throws an error if info config does not exist', async () => {
    readJsonStub.returns({ oclif: {} });

    try {
      await getInfoConfig(path);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(err.message).to.equal('getInfoConfig() failed to find pjson.oclif.info config');
    }
  });
});
