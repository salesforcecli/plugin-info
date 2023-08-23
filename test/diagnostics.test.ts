/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as childProcess from 'child_process';
import * as Sinon from 'sinon';
import { expect } from 'chai';
import { fromStub, spyMethod, stubInterface, stubMethod } from '@salesforce/ts-sinon';
import { Config, Interfaces } from '@oclif/core';
import { Lifecycle } from '@salesforce/core';
import { ux } from '@oclif/core';
import { Doctor } from '../src/doctor';
import { Diagnostics } from '../src/diagnostics';

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

describe('Diagnostics', () => {
  const sandbox = Sinon.createSandbox();
  const lifecycle = Lifecycle.getInstance();

  let childProcessExecStub: sinon.SinonStub;
  let drAddSuggestionSpy: sinon.SinonSpy;
  let lifecycleEmitSpy: sinon.SinonSpy;

  beforeEach(() => {
    stubMethod(sandbox, ux, 'log');
    childProcessExecStub = stubMethod(sandbox, childProcess, 'exec');
    drAddSuggestionSpy = spyMethod(sandbox, Doctor.prototype, 'addSuggestion');
    lifecycleEmitSpy = spyMethod(sandbox, lifecycle, 'emit');
    oclifConfig = {
      name: 'sfdx-cli',
      version: '7.160.0',
      pjson: {
        engines: {
          node: 'node-v16.17.0',
        },
      },
      plugins: [{ name: '@salesforce/plugin-org' }, { name: '@salesforce/plugin-source' }, { name: 'salesforce-alm' }],
      getPluginsList: () => oclifConfig.plugins,
      versionDetails: {},
    } as unknown as Config;
  });

  afterEach(() => {
    sandbox.restore();
    // Reset the instance for testing
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment,@typescript-eslint/no-unsafe-assignment
    // @ts-ignore
    delete Doctor.instance;
  });

  it('run() executes all methods ending in "Check"', () => {
    const dr = Doctor.init(oclifConfig);
    const diagnostics = new Diagnostics(dr, oclifConfig);
    const results = diagnostics.run();

    // This will have to be updated with each new test
    expect(results.length).to.equal(4);
    expect(childProcessExecStub.called).to.be.true;
    expect(lifecycleEmitSpy.called).to.be.true;
    expect(lifecycleEmitSpy.args[0][0]).to.equal('Doctor:diagnostic');
    expect(lifecycleEmitSpy.args[0][1]).to.have.property('testName');
    expect(lifecycleEmitSpy.args[0][1]).to.have.property('status');
  });

  describe('outdatedCliVersionCheck', () => {
    it('passes when CLI version is equal to latest', async () => {
      childProcessExecStub.callsFake((cmdString, opts, cb: (e: unknown, stdout: unknown, stderr: unknown) => void) => {
        expect(cmdString).to.equal('npm view sfdx-cli dist-tags.latest');
        expect(opts).to.be.ok;
        cb({}, '7.160.0', '');
      });

      const dr = Doctor.init(oclifConfig);
      const diagnostics = new Diagnostics(dr, oclifConfig);
      await diagnostics.outdatedCliVersionCheck();

      expect(drAddSuggestionSpy.called).to.be.false;
      expect(lifecycleEmitSpy.called).to.be.true;
      expect(lifecycleEmitSpy.args[0][1]).to.deep.equal({
        testName: 'using latest or latest-rc CLI version',
        status: 'pass',
      });
    });

    it('passes when CLI version is greater than latest', async () => {
      childProcessExecStub.callsFake((cmdString, opts, cb: (e: unknown, stdout: unknown, stderr: unknown) => void) => {
        expect(cmdString).to.equal('npm view sfdx-cli dist-tags.latest');
        expect(opts).to.be.ok;
        cb({}, '7.159.0', '');
      });

      const dr = Doctor.init(oclifConfig);
      const diagnostics = new Diagnostics(dr, oclifConfig);
      await diagnostics.outdatedCliVersionCheck();

      expect(drAddSuggestionSpy.called).to.be.false;
      expect(lifecycleEmitSpy.called).to.be.true;
      expect(lifecycleEmitSpy.args[0][1]).to.deep.equal({
        testName: 'using latest or latest-rc CLI version',
        status: 'pass',
      });
    });

    it('fails when CLI version is less than latest', async () => {
      childProcessExecStub.callsFake((cmdString, opts, cb: (e: unknown, stdout: unknown, stderr: unknown) => void) => {
        expect(cmdString).to.equal('npm view sfdx-cli dist-tags.latest');
        expect(opts).to.be.ok;
        cb({}, '7.162.0', '');
      });

      const dr = Doctor.init(oclifConfig);
      const diagnostics = new Diagnostics(dr, oclifConfig);
      await diagnostics.outdatedCliVersionCheck();

      expect(drAddSuggestionSpy.called).to.be.true;
      expect(lifecycleEmitSpy.called).to.be.true;
      expect(lifecycleEmitSpy.args[0][1]).to.deep.equal({
        testName: 'using latest or latest-rc CLI version',
        status: 'fail',
      });
    });

    it('fails when npm request fails', async () => {
      childProcessExecStub.callsFake((cmdString, opts, cb: (e: unknown, stdout: unknown, stderr: unknown) => void) => {
        expect(cmdString).to.equal('npm view sfdx-cli dist-tags.latest');
        expect(opts).to.be.ok;
        cb({ code: 1 }, '', 'connection timeout');
      });

      const dr = Doctor.init(oclifConfig);
      const diagnostics = new Diagnostics(dr, oclifConfig);
      await diagnostics.outdatedCliVersionCheck();

      expect(drAddSuggestionSpy.called).to.be.true;
      expect(lifecycleEmitSpy.called).to.be.true;
      expect(lifecycleEmitSpy.args[0][1]).to.deep.equal({
        testName: 'using latest or latest-rc CLI version',
        status: 'unknown',
      });
    });
  });

  describe('salesforceDxPluginCheck', () => {
    it('passes when salesforcedx plugin not installed', async () => {
      const dr = Doctor.init(oclifConfig);
      const diagnostics = new Diagnostics(dr, oclifConfig);
      await diagnostics.salesforceDxPluginCheck();

      expect(drAddSuggestionSpy.called).to.be.false;
      expect(lifecycleEmitSpy.called).to.be.true;
      expect(lifecycleEmitSpy.args[0][1]).to.deep.equal({
        testName: 'salesforcedx plugin not installed',
        status: 'pass',
      });
    });

    it('fails when salesforcedx plugin is installed', async () => {
      const versionDetail = getVersionDetailStub();
      versionDetail.pluginVersions = {};
      versionDetail.pluginVersions['salesforcedx'] = { version: '1.0.0', root: 'path/to/root', type: 'core' };
      // @ts-expect-error: stubbing a private property
      oclifConfig.versionDetails = versionDetail;
      const dr = Doctor.init(oclifConfig);
      const diagnostics = new Diagnostics(dr, oclifConfig);
      await diagnostics.salesforceDxPluginCheck();

      expect(drAddSuggestionSpy.called).to.be.true;
      expect(lifecycleEmitSpy.called).to.be.true;
      expect(lifecycleEmitSpy.args[0][1]).to.deep.equal({
        testName: 'salesforcedx plugin not installed',
        status: 'fail',
      });
    });
  });
  describe('deprecatedCliCheck', () => {
    it('fails when sfdx 7 installed', async () => {
      const dr = Doctor.init(oclifConfig);
      const diagnostics = new Diagnostics(dr, oclifConfig);
      await diagnostics.deprecatedCliCheck();

      expect(drAddSuggestionSpy.called).to.be.true;
      expect(lifecycleEmitSpy.called).to.be.true;
      expect(lifecycleEmitSpy.args[0][1]).to.deep.equal({
        testName: 'using sfdx-cli version 7',
        status: 'fail',
      });
    });

    it('fails when sf 1 installed', async () => {
      oclifConfig.name = '@salesforce/cli';
      oclifConfig.version = '1.0.0';
      const dr = Doctor.init(oclifConfig);
      const diagnostics = new Diagnostics(dr, oclifConfig);
      await diagnostics.deprecatedCliCheck();

      expect(drAddSuggestionSpy.called).to.be.true;
      expect(lifecycleEmitSpy.called).to.be.true;
      expect(lifecycleEmitSpy.args[0][1]).to.deep.equal({
        testName: 'using @salesforce/cli version 1',
        status: 'fail',
      });
    });

    it('passes when sf 2 is installed', async () => {
      oclifConfig.name = '@salesforce/cli';
      oclifConfig.version = '2.0.0';
      const dr = Doctor.init(oclifConfig);
      const diagnostics = new Diagnostics(dr, oclifConfig);
      await diagnostics.deprecatedCliCheck();

      expect(drAddSuggestionSpy.called).to.be.false;
      expect(lifecycleEmitSpy.called).to.be.false;
    });
  });

  describe('linkedPluginCheck', () => {
    it('passes when linked plugin not found', async () => {
      const dr = Doctor.init(oclifConfig);
      const diagnostics = new Diagnostics(dr, oclifConfig);
      await diagnostics.linkedPluginCheck();

      expect(drAddSuggestionSpy.called).to.be.false;
      expect(lifecycleEmitSpy.called).to.be.true;
      expect(lifecycleEmitSpy.args[0][1]).to.deep.equal({
        testName: 'no linked plugins',
        status: 'pass',
      });
    });

    it('fails when linked plugin is found', async () => {
      oclifConfig = fromStub(
        stubInterface<Config>(sandbox, {
          pjson: {
            engines: {
              node: 'node-v16.17.0',
            },
          },
          plugins: [
            { name: '@salesforce/plugin-org', type: 'core' },
            { name: '@salesforce/plugin-source', type: 'link' },
            { name: 'salesforce-alm', type: 'core' },
          ],
          getPluginsList: () => [
            { name: '@salesforce/plugin-org', type: 'core' },
            { name: '@salesforce/plugin-source', type: 'link' },
            { name: 'salesforce-alm', type: 'core' },
          ],
        })
      );
      const dr = Doctor.init(oclifConfig);
      const diagnostics = new Diagnostics(dr, oclifConfig);
      await diagnostics.linkedPluginCheck();

      expect(drAddSuggestionSpy.called).to.be.true;
      expect(lifecycleEmitSpy.called).to.be.true;
      expect(lifecycleEmitSpy.args[0][1]).to.deep.equal({
        testName: 'no linked plugins',
        status: 'fail',
      });
    });
  });
});
