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
import semver from 'semver';
import { stubMethod, spyMethod } from '@salesforce/ts-sinon';
import SinonChai from 'sinon-chai';
import { ProxyAgent } from 'proxy-agent';
import { getReleaseNotes } from '../../src/shared/getReleaseNotes.js';
import { SFDX_RELEASE_NOTES_TIMEOUT } from '../../src/constants.js';

chaiUse(SinonChai);

type gotResponse = {
  statusCode: number;
  body: string;
};

describe('getReleaseNotes tests', () => {
  const sandbox = Sinon.createSandbox();

  let gotStub: sinon.SinonStub;
  let semverSpy: Sinon.SinonSpy;

  let path: string;
  let rawPath: string;
  let version: string;
  let filename: string;
  let versionedResponse: gotResponse;
  let readmeResponse: gotResponse;

  beforeEach(() => {
    path = 'https://github.com/forcedotcom/cli/tree/main/releasenotes/sfdx';
    rawPath = 'https://raw.githubusercontent.com/forcedotcom/cli/main/releasenotes/sfdx';
    version = '1.2.3';
    filename = 'readme.md';
    versionedResponse = {
      statusCode: 200,
      body: 'versioned response body',
    };
    readmeResponse = {
      statusCode: 200,
      body: 'readme response body',
    };

    gotStub = stubMethod(sandbox, got, 'get');
    semverSpy = spyMethod(sandbox, semver, 'major');

    gotStub.onCall(0).returns(versionedResponse);
    gotStub.onCall(1).returns(readmeResponse);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('semver.major is called passed version', async () => {
    await getReleaseNotes(path, filename, version);

    expect(semverSpy.args[0][0]).to.equal(version);
    expect(semverSpy.returnValues[0]).to.equal(1);
  });

  it('converts path from pjson.oclif.info to a raw github url', async () => {
    await getReleaseNotes(path, filename, version);

    expect(gotStub.args[0][0]).to.include(rawPath);
  });

  it('makes versioned GET request with correct args', async () => {
    await getReleaseNotes(path, filename, version);

    // const expected = [`${rawPath}/v1.md`, options];

    // expect(JSON.parse(JSON.stringify(gotStub.args[0]))).to.deep.equal(expected);
    expect(gotStub.args[0][0]).to.equal(`${rawPath}/v1.md`);
    expect(gotStub.args[0][1]).to.have.property('timeout').and.deep.equal({ request: SFDX_RELEASE_NOTES_TIMEOUT });
    expect(gotStub.args[0][1]).to.have.property('throwHttpErrors').and.equal(false);
    expect(gotStub.args[0][1]).to.have.property('agent').and.to.have.property('https').and.be.instanceOf(ProxyAgent);
  });

  it('makes readme GET request with correct args', async () => {
    await getReleaseNotes(path, filename, version);

    // const expected = [`${rawPath}/${filename}`, { ...options, throwHttpErrors: true }];

    // expect(JSON.parse(JSON.stringify(gotStub.args[1]))).to.deep.equal(expected);
    expect(gotStub.args[1][0]).to.equal(`${rawPath}/${filename}`);
    expect(gotStub.args[1][1]).to.have.property('timeout').and.deep.equal({ request: SFDX_RELEASE_NOTES_TIMEOUT });
    expect(gotStub.args[1][1]).to.have.property('throwHttpErrors').and.equal(true);
    expect(gotStub.args[1][1]).to.have.property('agent').and.to.have.property('https').and.be.instanceOf(ProxyAgent);
  });

  it('returns versioned markdown if found', async () => {
    const body = await getReleaseNotes(path, filename, version);

    expect(body).to.equal('versioned response body');
  });

  it('returns readme markdown if versioned markdown is not found', async () => {
    versionedResponse.statusCode = 404;

    const body = await getReleaseNotes(path, filename, version);

    expect(body).to.equal('readme response body');
  });
});
