/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import * as Sinon from 'sinon';
import { expect } from 'chai';
import { fromStub, stubInterface, stubMethod, spyMethod } from '@salesforce/ts-sinon';
import { AnyJson } from '@salesforce/ts-types';
import { UX } from '@salesforce/command';
import { Lifecycle, Messages } from '@salesforce/core';
import { Config } from '@oclif/core';
import { VersionDetail } from '@oclif/plugin-version';
import DoctorCmd from '../../src/commands/doctor';
import { Doctor, SfDoctor, SfDoctorDiagnosis, Diagnostics, DiagnosticStatus } from '../../src';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-info', 'doctor');

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

// Lifecycle handler to emulate plugin hook handling of Doctor events
Lifecycle.getInstance().on('sf-doctor', async (dr: SfDoctor) => {
  expect(dr).to.be.instanceof(Doctor);
  dr.addPluginData('@salesforce/plugin-source', { apiVersion: '56.0' });
});
// Lifecycle handler to emulate plugin hook handling of Doctor events
Lifecycle.getInstance().on('sf-doctor-@salesforce/plugin-org', async (dr: SfDoctor) => {
  expect(dr).to.be.instanceof(Doctor);
  dr.addPluginData('@salesforce/plugin-org', { preview: true });
});

describe('Doctor Command', () => {
  const sandbox = Sinon.createSandbox();

  let uxLogStub: sinon.SinonStub;
  let uxStyledHeaderStub: sinon.SinonStub;
  let fsExistsSyncStub: sinon.SinonStub;
  let fsMkdirSyncStub: sinon.SinonStub;
  let fsWriteFileSyncStub: sinon.SinonStub;
  let diagnosticsRunStub: sinon.SinonStub;
  let childProcessExecStub: sinon.SinonStub;
  let promptStub: sinon.SinonStub;
  let lifecycleEmitSpy: sinon.SinonSpy;

  oclifConfigStub = fromStub(
    stubInterface<Config>(sandbox, {
      pjson: {
        engines: {
          node: 'node-v16.17.0',
        },
      },
      plugins: [{ name: '@salesforce/plugin-org' }, { name: '@salesforce/plugin-source' }, { name: 'salesforce-alm' }],
      bin: 'sfdx',
    })
  );

  class TestDoctor extends DoctorCmd {
    public async runIt() {
      await this.init();
      return this.run();
    }
  }

  const runDoctorCmd = async (params: string[]) => {
    // oclifConfigStub.bin = 'sfdx';
    const cmd = new TestDoctor(params, oclifConfigStub);
    uxLogStub = stubMethod(sandbox, UX.prototype, 'log');
    promptStub = stubMethod(sandbox, UX.prototype, 'prompt').resolves('my new and crazy issue');

    uxStyledHeaderStub = stubMethod(sandbox, UX.prototype, 'styledHeader');

    return cmd.runIt();
  };

  beforeEach(() => {
    fsExistsSyncStub = stubMethod(sandbox, fs, 'existsSync');
    fsMkdirSyncStub = stubMethod(sandbox, fs, 'mkdirSync');
    fsWriteFileSyncStub = stubMethod(sandbox, fs, 'writeFileSync');
    diagnosticsRunStub = stubMethod(sandbox, Diagnostics.prototype, 'run');
    childProcessExecStub = stubMethod(sandbox, childProcess, 'exec');
    lifecycleEmitSpy = spyMethod(sandbox, Lifecycle.prototype, 'emit');
  });

  afterEach(() => {
    sandbox.restore();
    // Reset the instance for testing
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment,@typescript-eslint/no-unsafe-assignment
    // @ts-ignore
    delete Doctor.instance;
  });

  const verifySuggestions = (result: SfDoctorDiagnosis, suggestions: string[] = []) => {
    const defaults = [
      messages.getMessage('pinnedSuggestions.checkGitHubIssues'),
      messages.getMessage('pinnedSuggestions.checkSfdcStatus'),
    ];
    const expectedSuggestions = [...defaults, ...suggestions];
    expect(result.suggestions).to.deep.equal(expectedSuggestions);
  };

  const verifyLogFiles = (result: SfDoctorDiagnosis, fileNames: string[] = []) => {
    const defaults = ['diagnosis.json'];
    const expectedLogFiles = [...defaults, ...fileNames];
    result.logFilePaths.every((logFilePath) => {
      expect(expectedLogFiles.some((f) => logFilePath.includes(f))).to.be.true;
    });
  };

  const verifyEnvVars = (result: SfDoctorDiagnosis) => {
    result.sfdxEnvVars.every((envVar) => {
      expect(envVar[0].startsWith('SFDX_')).to.be.true;
    });
    result.sfEnvVars.every((envVar) => {
      expect(envVar[0].startsWith('SF_')).to.be.true;
    });
  };

  const verifyPluginSpecificData = (result: SfDoctorDiagnosis, entry?: AnyJson) => {
    const data = entry ?? { '@salesforce/plugin-source': [{ apiVersion: '56.0' }] };
    expect(result.pluginSpecificData).to.deep.equal(data);
  };

  it('runs doctor command with no flags', async () => {
    const suggestion = 'work smarter, not faster';
    fsExistsSyncStub.returns(true);
    const versionDetail = getVersionDetailStub();
    const diagnosticStatus: DiagnosticStatus = { testName: 'doctor test', status: 'pass' };
    Doctor.init(oclifConfigStub, versionDetail);
    diagnosticsRunStub.callsFake(() => {
      const dr = Doctor.getInstance();
      const promise = Lifecycle.getInstance().emit('Doctor:diagnostic', diagnosticStatus);
      dr.addSuggestion(suggestion);
      return [promise];
    });

    const result = await runDoctorCmd([]);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail', versionDetail);
    expect(result).to.have.property('cliConfig');
    verifyPluginSpecificData(result);
    expect(result.diagnosticResults).to.deep.equal([diagnosticStatus]);
    verifyEnvVars(result);
    verifySuggestions(result, [suggestion]);
    verifyLogFiles(result);
    expect(fsExistsSyncStub.args[0][0]).to.equal(process.cwd());
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(fsWriteFileSyncStub.calledOnce).to.be.true;
    expect(lifecycleEmitSpy.called).to.be.true;
    expect(lifecycleEmitSpy.args[0][0]).to.equal('sf-doctor');
    expect(lifecycleEmitSpy.args[0][1]).to.equal(Doctor.getInstance());
  });

  it('runs doctor command with outputdir flag (existing dir)', async () => {
    const outputdir = path.resolve('foo', 'bar', 'test');
    fsExistsSyncStub.returns(true);
    const versionDetail = getVersionDetailStub();
    Doctor.init(oclifConfigStub, versionDetail);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);

    const result = await runDoctorCmd(['--outputdir', outputdir]);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail', versionDetail);
    expect(result).to.have.property('cliConfig');
    verifyPluginSpecificData(result);
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result);
    expect(fsExistsSyncStub.args[0][0]).to.equal(outputdir);
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(fsWriteFileSyncStub.calledOnce).to.be.true;
    expect(lifecycleEmitSpy.called).to.be.true;
    expect(lifecycleEmitSpy.args[0][0]).to.equal('sf-doctor');
    expect(lifecycleEmitSpy.args[0][1]).to.equal(Doctor.getInstance());
  });

  it('runs doctor command with outputdir flag (non-existing dir)', async () => {
    const outputdir = path.resolve('foo', 'bar', 'test');
    fsExistsSyncStub.returns(false);
    const versionDetail = getVersionDetailStub();
    Doctor.init(oclifConfigStub, versionDetail);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);

    const result = await runDoctorCmd(['--outputdir', outputdir]);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail', versionDetail);
    expect(result).to.have.property('cliConfig');
    verifyPluginSpecificData(result);
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result);
    expect(fsExistsSyncStub.args[0][0]).to.equal(outputdir);
    expect(fsMkdirSyncStub.called).to.be.true;
    expect(fsWriteFileSyncStub.calledOnce).to.be.true;
    expect(lifecycleEmitSpy.called).to.be.true;
    expect(lifecycleEmitSpy.args[0][0]).to.equal('sf-doctor');
    expect(lifecycleEmitSpy.args[0][1]).to.equal(Doctor.getInstance());
  });

  it('runs doctor command with command flag (minimal)', async () => {
    const cmd = 'force:org:list --all';
    const expectedCmd = `${oclifConfigStub.bin} ${cmd} --dev-debug`;
    fsExistsSyncStub.returns(true);
    const versionDetail = getVersionDetailStub();
    Doctor.init(oclifConfigStub, versionDetail);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);
    childProcessExecStub.callsFake((cmdString, opts, cb: () => void) => {
      expect(cmdString).to.equal(expectedCmd);
      expect(opts).to.be.ok;
      cb();
    });

    const result = await runDoctorCmd(['--command', cmd]);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail', versionDetail);
    expect(result).to.have.property('cliConfig');
    verifyPluginSpecificData(result);
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result, ['-command-stdout.log', '-command-debug.log']);
    expect(fsExistsSyncStub.args[0][0]).to.equal(process.cwd());
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(fsWriteFileSyncStub.calledThrice).to.be.true;
    expect(lifecycleEmitSpy.called).to.be.true;
    expect(lifecycleEmitSpy.args[0][0]).to.equal('sf-doctor');
    expect(lifecycleEmitSpy.args[0][1]).to.equal(Doctor.getInstance());
    expect(result).to.have.property('commandName', expectedCmd);
  });

  it('runs doctor command with command flag (full)', async () => {
    const cmd = `${oclifConfigStub.bin} force:org:list --all --dev-debug`;
    fsExistsSyncStub.returns(true);
    const versionDetail = getVersionDetailStub();
    Doctor.init(oclifConfigStub, versionDetail);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);
    childProcessExecStub.callsFake((cmdString, opts, cb: () => void) => {
      expect(cmdString).to.equal(cmd);
      expect(opts).to.be.ok;
      cb();
    });

    const result = await runDoctorCmd(['--command', cmd]);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail', versionDetail);
    expect(result).to.have.property('cliConfig');
    verifyPluginSpecificData(result);
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result, ['-command-stdout.log', '-command-debug.log']);
    expect(fsExistsSyncStub.args[0][0]).to.equal(process.cwd());
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(fsWriteFileSyncStub.calledThrice).to.be.true;
    expect(lifecycleEmitSpy.called).to.be.true;
    expect(lifecycleEmitSpy.args[0][0]).to.equal('sf-doctor');
    expect(lifecycleEmitSpy.args[0][1]).to.equal(Doctor.getInstance());
    expect(result).to.have.property('commandName', cmd);
  });

  it('runs doctor command with plugin flag', async () => {
    fsExistsSyncStub.returns(true);
    const versionDetail = getVersionDetailStub();
    Doctor.init(oclifConfigStub, versionDetail);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);

    const result = await runDoctorCmd(['--plugin', '@salesforce/plugin-org']);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail', versionDetail);
    expect(result).to.have.property('cliConfig');
    verifyPluginSpecificData(result, { '@salesforce/plugin-org': [{ preview: true }] });
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result);
    expect(fsExistsSyncStub.args[0][0]).to.equal(process.cwd());
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(fsWriteFileSyncStub.calledOnce).to.be.true;
    expect(lifecycleEmitSpy.called).to.be.true;
    expect(lifecycleEmitSpy.args[0][0]).to.equal('sf-doctor-@salesforce/plugin-org');
    expect(lifecycleEmitSpy.args[0][1]).to.equal(Doctor.getInstance());
  });

  it('runs doctor command with plugin flag (no plugin tests)', async () => {
    fsExistsSyncStub.returns(true);
    const versionDetail = getVersionDetailStub();
    Doctor.init(oclifConfigStub, versionDetail);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);

    const result = await runDoctorCmd(['--plugin', '@salesforce/plugin-source']);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail', versionDetail);
    expect(result).to.have.property('cliConfig');
    verifyPluginSpecificData(result, {});
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result);
    expect(fsExistsSyncStub.args[0][0]).to.equal(process.cwd());
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(fsWriteFileSyncStub.calledOnce).to.be.true;
    expect(lifecycleEmitSpy.called).to.be.false;
  });

  it('runs doctor command with createissue flag', async () => {
    fsExistsSyncStub.returns(true);

    sandbox.stub(DoctorCmd, 'openUrl').resolves();
    const versionDetail = getVersionDetailStub();
    Doctor.init(oclifConfigStub, versionDetail);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);

    const result = await runDoctorCmd(['--createissue']);

    expect(uxLogStub.called).to.be.true;
    expect(promptStub.callCount).to.equal(2);
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail', versionDetail);
    expect(result).to.have.property('cliConfig');
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result);
    expect(fsExistsSyncStub.args[0][0]).to.equal(process.cwd());
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(fsWriteFileSyncStub.calledOnce).to.be.true;
  });

  it('throws with uninstalled plugin flag', async () => {
    fsExistsSyncStub.returns(true);
    const versionDetail = getVersionDetailStub();
    Doctor.init(oclifConfigStub, versionDetail);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);

    try {
      await runDoctorCmd(['--plugin', 'not-installed']);
      expect(false, 'Expected UnknownPluginError').to.be.true;
    } catch (err) {
      const error = err as Error;
      expect(error.name).to.equal('UnknownPluginError');
      expect(error.message).to.include(
        "Specified plugin [not-installed] isn't installed. Install it, correct the name, or choose another plugin."
      );
    }
  });
});
