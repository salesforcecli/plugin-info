/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import got from 'got';
import { expect, use as chaiUse } from 'chai';
import * as Sinon from 'sinon';
import * as SinonChai from 'sinon-chai';
import * as semver from 'semver';
import { stubMethod, spyMethod } from '@salesforce/ts-sinon';
import { getReleaseNotes } from '../../src/shared/getReleaseNotes';
import { PLUGIN_INFO_GET_TIMEOUT } from '../../src/constants';

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
  let version: string;
  let filename: string;
  let options;
  let versionedResponse: gotResponse;
  let readmeResponse: gotResponse;

  beforeEach(() => {
    path = 'https://example.com';
    version = '1.2.3';
    filename = 'readme.md';
    options = {
      timeout: PLUGIN_INFO_GET_TIMEOUT,
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

  it('makes versioned GET request with correct args', async () => {
    await getReleaseNotes(path, filename, version);

    const expected = [`${path}/v1.md`, options];

    expect(gotStub.args[0]).to.deep.equal(expected);
  });

  it('makes readme GET request with correct args', async () => {
    await getReleaseNotes(path, filename, version);

    const expected = [`${path}/${filename}`, { ...options, throwHttpErrors: true }];

    expect(gotStub.args[1]).to.deep.equal(expected);
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
