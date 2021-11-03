/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import got from 'got';
import { expect, use as chaiUse } from 'chai';
import * as Sinon from 'sinon';
import * as SinonChai from 'sinon-chai';
import { stubMethod } from '@salesforce/ts-sinon';
import { getDistTagVersion, DistTagJson } from '../../src/shared/get-dist-tag-version';

chaiUse(SinonChai);

describe('getReleaseNotes tests', () => {
  let sandbox: sinon.SinonSandbox;
  let gotStub: sinon.SinonStub;

  let url;
  let gotResponse: DistTagJson;

  beforeEach(() => {
    url = 'https://registry.npmjs.org/-/package/sfdx-cli/dist-tags';
    gotResponse = {
      latest: '1.2.3',
      'latest-rc': '1.3.0',
    };

    sandbox = Sinon.createSandbox();

    gotStub = stubMethod(sandbox, got, 'default');
    gotStub.returns({
      json: () => gotResponse,
    });
  });

  afterEach(() => {
    gotStub.restore();
    sandbox.restore();
  });

  it('calls got with correct args', async () => {
    await getDistTagVersion(url, 'latest');

    expect(gotStub.args[0]).to.deep.equal([url, { timeout: 3000 }]);
  });

  it('returns rc if version is "latest-rc"', async () => {
    const version = await getDistTagVersion(url, 'latest-rc');

    expect(version).to.equal('1.3.0');
  });

  it('returns rc if version includes "rc"', async () => {
    const version = await getDistTagVersion(url, 'stable-rc');

    expect(version).to.equal('1.3.0');
  });

  it('returns latest by default', async () => {
    const version = await getDistTagVersion(url, 'foobar');

    expect(version).to.equal('1.2.3');
  });
});
