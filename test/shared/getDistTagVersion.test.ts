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
import { expect, use as chaiUse } from 'chai';
import Sinon from 'sinon';
import SinonChai from 'sinon-chai';
import { ProxyAgent } from 'proxy-agent';
import { stubMethod } from '@salesforce/ts-sinon';
import { getDistTagVersion, DistTagJson } from '../../src/shared/getDistTagVersion.js';

chaiUse(SinonChai);

describe('getDistTagVersion tests', () => {
  const sandbox = Sinon.createSandbox();

  let gotStub: sinon.SinonStub;

  let url: string;
  let gotResponse: DistTagJson;

  beforeEach(() => {
    url = 'https://registry.npmjs.org/-/package/sfdx-cli/dist-tags';
    gotResponse = {
      latest: '1.2.3',
      'latest-rc': '1.3.0',
    };

    gotStub = stubMethod(sandbox, got, 'get');
    gotStub.returns({
      json: () => gotResponse,
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('calls got with correct args', async () => {
    await getDistTagVersion(url, 'latest');

    expect(gotStub.args[0][0]).to.equal(url);
    expect(gotStub.args[0][1]).to.have.property('timeout').and.to.deep.equal({ request: 3000 });
    expect(gotStub.args[0][1]).to.have.property('agent').and.to.have.property('https').and.be.instanceOf(ProxyAgent);
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
