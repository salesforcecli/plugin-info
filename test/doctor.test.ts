/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'fs';
import * as path from 'path';
import * as Sinon from 'sinon';
import { expect } from 'chai';
import { fromStub, stubInterface, stubMethod } from '@salesforce/ts-sinon';
import { Config } from '@oclif/core';
import { VersionDetail } from '@oclif/plugin-version';
import { Doctor } from '../src/doctor';

let oclifConfigStub: Config;

const getVersionDetailStub = (overrides?: Partial<VersionDetail>): VersionDetail => {
  const defaults: VersionDetail = {
    cliVersion: 'sfdx-cli/7.160.0',
    architecture: 'darwin-x64',
    nodeVersion: 'node-v16.17.0',
    osVersion: 'Darwin 21.6.0',
    shell: 'zsh',
    rootPath: '/Users/foo/testdir',
    pluginVersions: ['org 2.2.0 (core)', 'source 2.0.13 (core)', 'salesforce-alm 54.8.1 (core)'],
  };
  return { ...defaults, ...overrides };
};

describe('Doctor Class', () => {
  const sandbox = Sinon.createSandbox();

  oclifConfigStub = fromStub(
    stubInterface<Config>(sandbox, {
      pjson: {
        engines: {
          node: 'node-v16.17.0',
        },
      },
      plugins: [{ name: '@salesforce/plugin-org' }, { name: '@salesforce/plugin-source' }, { name: 'salesforce-alm' }],
    })
  );

  afterEach(() => {
    sandbox.restore();
    // Reset the instance for testing
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment,@typescript-eslint/no-unsafe-assignment
    // @ts-ignore
    delete Doctor.instance;
  });

  it('throws when getInstance() called before init()', async () => {
    try {
      Doctor.getInstance();
      expect(false, 'should have thrown SfDoctorInitError').to.be.true;
    } catch (err) {
      const error = err as Error;
      expect(error.name).to.equal('SfDoctorInitError');
      expect(error.message).to.include('Must first initialize a new SfDoctor');
    }
  });

  it('throws when init() called twice', async () => {
    try {
      Doctor.init(oclifConfigStub, getVersionDetailStub());
      Doctor.init(oclifConfigStub, getVersionDetailStub());
      expect(false, 'should have thrown SfDoctorInitError').to.be.true;
    } catch (err) {
      const error = err as Error;
      expect(error.name).to.equal('SfDoctorInitError');
      expect(error.message).to.include('SfDoctor has already been initialized');
    }
  });

  it('adds plugin data', async () => {
    const pluginName = '@salesforce/plugin-org';
    const dataEntries = ['fooEntry1', 'fooEntry2'];
    const expectedEntry = { [pluginName]: [dataEntries[0]] };
    const dr = Doctor.init(oclifConfigStub, getVersionDetailStub());
    dr.addPluginData(pluginName, dataEntries[0]);
    expect(dr.getDiagnosis().pluginSpecificData).to.deep.equal(expectedEntry);
    dr.addPluginData(pluginName, dataEntries[1]);
    expectedEntry[pluginName] = [dataEntries[0], dataEntries[1]];
    expect(dr.getDiagnosis().pluginSpecificData).to.deep.equal(expectedEntry);
  });

  it('writes file names with doctor ID', async () => {
    const dateNow = 1234;
    const fileContent = 'test content';
    stubMethod(sandbox, Date, 'now').returns(dateNow);
    stubMethod(sandbox, fs, 'existsSync').returns(true);
    const fsWriteFileSyncStub = stubMethod(sandbox, fs, 'writeFileSync');
    const dr = Doctor.init(oclifConfigStub, getVersionDetailStub());

    const filePath = path.resolve('foo.log');
    const expectedFilePath = path.resolve('1234-foo.log');
    const fullPath = dr.writeFileSync(filePath, fileContent);

    expect(fullPath).to.equal(expectedFilePath);
    expect(fsWriteFileSyncStub.called).to.be.true;
    expect(fsWriteFileSyncStub.args[0][0]).to.equal(expectedFilePath);
    expect(fsWriteFileSyncStub.args[0][1]).to.equal(fileContent);
  });
});
