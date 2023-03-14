/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import got from 'got';
import { expect, use as chaiUse } from 'chai';
import * as Sinon from 'sinon';
import * as semver from 'semver';
import { stubMethod, spyMethod } from '@salesforce/ts-sinon';
import * as SinonChai from 'sinon-chai';
import { getReleaseNotes } from '../../src/shared/getReleaseNotes';
import { SFDX_RELEASE_NOTES_TIMEOUT } from '../../src/constants';

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
  let options: Record<string, unknown>;
  let versionedResponse: gotResponse;
  let readmeResponse: gotResponse;

  beforeEach(() => {
    path = 'https://github.com/forcedotcom/cli/tree/main/releasenotes/sfdx';
    rawPath = 'https://raw.githubusercontent.com/forcedotcom/cli/main/releasenotes/sfdx';
    version = '1.2.3';
    filename = 'readme.md';
    options = {
      agent: { https: {} },
      timeout: SFDX_RELEASE_NOTES_TIMEOUT,
      throwHttpErrors: false,
    };
    versionedResponse = {
      statusCode: 200,
      body: 'versioned response body',
    };
    readmeResponse = {
      statusCode: 200,
      body: 'readme response body',
    };

    gotStub = stubMethod(sandbox, got, 'default');
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

    const expected = [`${rawPath}/v1.md`, options];

    expect(JSON.parse(JSON.stringify(gotStub.args[0]))).to.deep.equal(expected);
  });

  it('makes readme GET request with correct args', async () => {
    await getReleaseNotes(path, filename, version);

    const expected = [`${rawPath}/${filename}`, { ...options, throwHttpErrors: true }];

    expect(JSON.parse(JSON.stringify(gotStub.args[1]))).to.deep.equal(expected);
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
