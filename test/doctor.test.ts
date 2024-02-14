/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import fs from 'node:fs';
import path from 'node:path';
import Sinon from 'sinon';
import { expect } from 'chai';
import { stubMethod } from '@salesforce/ts-sinon';
import { Config, Interfaces } from '@oclif/core';
import { Doctor } from '../src/doctor.js';

let oclifConfig: Config;

const getVersionDetailStub = (overrides?: Partial<Interfaces.VersionDetails>): Interfaces.VersionDetails => {
  const defaults: Interfaces.VersionDetails = {
    cliVersion: 'sfdx-cli/7.160.0',
    architecture: 'darwin-x64',
    nodeVersion: 'node-v16.17.0',
    osVersion: 'Darwin 21.6.0',
    shell: 'zsh',
    rootPath: '/Users/foo/testdir',
    pluginVersions: {
      org: {
        version: '2.2.0',
        type: 'core',
        root: 'foo',
      },
      source: {
        version: '2.0.13',
        type: 'core',
        root: 'bar',
      },
      'salesforce-alm': {
        version: '54.8.1',
        type: 'core',
        root: 'baz',
      },
    },
  };
  return { ...defaults, ...overrides };
};

describe('Doctor Class', () => {
  const sandbox = Sinon.createSandbox();

  oclifConfig = {
    pjson: {
      engines: {
        node: 'node-v16.17.0',
      },
    },
    plugins: [{ name: '@salesforce/plugin-org' }, { name: '@salesforce/plugin-source' }, { name: 'salesforce-alm' }],
    versionDetails: getVersionDetailStub(),
    _commandIDs: ['first', 'second'], // this should not be included in the diagnosis
    rootPlugin: { foo: 'bar' }, // this should not be included in the diagnosis
  } as unknown as Config;

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

  it('adds plugin data', async () => {
    const pluginName = '@salesforce/plugin-org';
    const dataEntries = ['fooEntry1', 'fooEntry2'];
    const expectedEntry = { [pluginName]: [dataEntries[0]] };
    const dr = Doctor.init(oclifConfig);
    dr.addPluginData(pluginName, dataEntries[0]);
    expect(dr.getDiagnosis().pluginSpecificData).to.deep.equal(expectedEntry);
    dr.addPluginData(pluginName, dataEntries[1]);
    expectedEntry[pluginName] = [dataEntries[0], dataEntries[1]];
    const diagnosis = dr.getDiagnosis();
    expect(diagnosis.pluginSpecificData).to.deep.equal(expectedEntry);
    expect(diagnosis.cliConfig).to.not.have.property('_commandIDs');
    expect(diagnosis.cliConfig).to.not.have.property('rootPlugin');
  });

  it('writes file names with doctor ID', async () => {
    const dateNow = 1234;
    const fileContent = 'test content';
    stubMethod(sandbox, Date, 'now').returns(dateNow);
    stubMethod(sandbox, fs, 'existsSync').returns(true);
    const fsWriteFileSyncStub = stubMethod(sandbox, fs, 'writeFileSync');
    const dr = Doctor.init(oclifConfig);

    const filePath = path.resolve('foo.log');
    const expectedFilePath = path.resolve('1234-foo.log');
    const fullPath = dr.writeFileSync(filePath, fileContent);

    expect(fullPath).to.equal(expectedFilePath);
    expect(fsWriteFileSyncStub.called).to.be.true;
    expect(fsWriteFileSyncStub.args[0][0]).to.equal(expectedFilePath);
    expect(fsWriteFileSyncStub.args[0][1]).to.equal(fileContent);
  });
});
