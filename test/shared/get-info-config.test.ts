/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as pathPkg from 'path';
import { expect, use as chaiUse } from 'chai';
import * as Sinon from 'sinon';
import * as SinonChai from 'sinon-chai';
import { stubMethod, spyMethod } from '@salesforce/ts-sinon';
import * as fsExtra from 'fs-extra';
import { getString } from '@salesforce/ts-types';
import { getInfoConfig, PjsonWithInfo } from '../../src/shared/get-info-config';

chaiUse(SinonChai);

describe('getInfoConfig tests', () => {
  let sandbox: sinon.SinonSandbox;
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

    sandbox = Sinon.createSandbox();
    readJsonStub = stubMethod(sandbox, fsExtra, 'readJson').returns(pjsonMock);
    joinSpy = spyMethod(sandbox, pathPkg, 'join');
  });

  afterEach(() => {
    joinSpy.restore();
    readJsonStub.restore();
    sandbox.restore();
  });

  it('join is called with path arg and package.json', async () => {
    await getInfoConfig(path);

    expect(joinSpy.args[0]).to.deep.equal([path, 'package.json']);
    expect(joinSpy.returnValues[0]).to.equal(`${path}/package.json`);
  });

  it('calls readJson with pjson path', async () => {
    await getInfoConfig(path);

    expect(readJsonStub.args[0][0]).to.deep.equal(`${path}/package.json`);
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
      const msg = getString(err, 'message');

      expect(msg).to.equal('getInfoConfig() failed to find pjson.oclif.info config');
    }
  });
});
