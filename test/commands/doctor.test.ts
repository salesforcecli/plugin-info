/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import path from 'node:path';
import childProcess from 'node:child_process';

import fs from 'node:fs';
import Sinon from 'sinon';
import { expect } from 'chai';
import { fromStub, stubInterface, stubMethod } from '@salesforce/ts-sinon';
import { Lifecycle, Messages } from '@salesforce/core';
import { Config, Interfaces } from '@oclif/core';
import { SfCommand } from '@salesforce/sf-plugins-core';
import DoctorCmd from '../../src/commands/doctor.js';
import { Diagnostics, Doctor, SfDoctorDiagnosis } from '../../src/index.js';
import { formatPlugins } from '../../src/doctor.js';
import { prompts } from '../../src/shared/prompts.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-info', 'doctor');

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

const getVersionDetailResult = (config: Interfaces.Config): Record<string, unknown> => {
  const defaults: Record<string, unknown> = {
    cliVersion: 'sfdx-cli/7.160.0',
    architecture: 'darwin-x64',
    nodeVersion: 'node-v16.17.0',
    osVersion: 'Darwin 21.6.0',
    shell: 'zsh',
    rootPath: '/Users/foo/testdir',
    pluginVersions: [],
  };
  return { ...defaults, pluginVersions: formatPlugins(config, config.versionDetails.pluginVersions ?? {}) };
};

describe('Doctor Command', () => {
  const sandbox = Sinon.createSandbox();

  let uxLogStub: sinon.SinonStub;
  let uxStyledHeaderStub: sinon.SinonStub;
  let fsExistsSyncStub: sinon.SinonStub;
  let fsMkdirSyncStub: sinon.SinonStub;
  let drWriteStdout: sinon.SinonStub;
  let drWriteStderr: sinon.SinonStub;
  let fsWriteFileSyncStub: sinon.SinonStub;
  let diagnosticsRunStub: sinon.SinonStub;
  let childProcessExecStub: sinon.SinonStub;
  let promptStub: sinon.SinonStub;
  let openStub: sinon.SinonStub;
  let runHookStub: sinon.SinonStub;

  const plugins = [
    {
      name: '@salesforce/plugin-org',
      hooks: { 'sf-doctor-@salesforce/plugin-org': ['./lib/hooks/diagnostics'] },
    },
    {
      name: '@salesforce/plugin-source',
      hooks: { 'sf-doctor-@salesforce/plugin-source': ['./lib/hooks/diagnostics'] },
    },
    {
      name: 'salesforce-alm',
      hooks: {},
    },
    {
      name: '@salesforce/plugin-data',
      hooks: {},
    },
  ].map((p) => ({
    ...p,
    commands: [],
    topics: [],
    pjson: {
      name: p.name,
      oclif: {
        hooks: p.hooks,
      },
    },
  }));

  oclifConfig = fromStub(
    stubInterface<Config>(sandbox, {
      runHook: async () => ({
        successes: [],
        failures: [],
      }),
      pjson: {
        engines: {
          node: 'node-v16.17.0',
        },
        oclif: {},
      },
      plugins: new Map(plugins.map((p) => [p.name, p])),
      getPluginsList: () => plugins,
      bin: 'sfdx',
      versionDetails: getVersionDetailStub(),
    })
  );

  const runDoctorCmd = async (params: string[]) => {
    const cmd = new DoctorCmd(params, oclifConfig);
    uxLogStub = stubMethod(sandbox, SfCommand.prototype, 'log');
    promptStub = sandbox.stub(prompts, 'titleInput').resolves('my new and crazy issue');
    // @ts-expect-error because private method
    openStub = sandbox.stub(cmd, 'openUrl').resolves();

    uxStyledHeaderStub = stubMethod(sandbox, SfCommand.prototype, 'styledHeader');
    // @ts-expect-error because private method
    runHookStub = sandbox.stub(DoctorCmd.prototype, 'runDoctorHook');
    return cmd.run();
  };

  beforeEach(async () => {
    fsExistsSyncStub = stubMethod(sandbox, fs, 'existsSync');
    fsMkdirSyncStub = stubMethod(sandbox, fs, 'mkdirSync');
    fsWriteFileSyncStub = stubMethod(sandbox, fs, 'writeFileSync');
    diagnosticsRunStub = stubMethod(sandbox, Diagnostics.prototype, 'run');
    childProcessExecStub = stubMethod(sandbox, childProcess, 'exec');
    drWriteStdout = stubMethod(sandbox, Doctor.prototype, 'writeStdout');
    drWriteStderr = stubMethod(sandbox, Doctor.prototype, 'writeStderr');
    stubMethod(sandbox, Doctor.prototype, 'createStdoutWriteStream');
    stubMethod(sandbox, Doctor.prototype, 'createStderrWriteStream');
    stubMethod(sandbox, Doctor.prototype, 'closeStdout');
    stubMethod(sandbox, Doctor.prototype, 'closeStderr');
  });

  afterEach(() => {
    sandbox.restore();
    // Reset the instance for testing
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment,@typescript-eslint/no-unsafe-assignment
    // @ts-ignore
    delete Doctor.instance;
  });

  const resetProxyEnvVars = () => {
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.no_proxy;
    delete process.env.NO_PROXY;
  };

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

  const verifyEnvVars = (result: SfDoctorDiagnosis, expectedProxyEnvVars: string[] | string[][] = []) => {
    result.sfdxEnvVars.every((envVar) => {
      expect(envVar[0].startsWith('SFDX_')).to.be.true;
    });
    result.sfEnvVars.every((envVar) => {
      expect(envVar[0].startsWith('SF_')).to.be.true;
    });
    expect(result.proxyEnvVars).to.deep.equal(expectedProxyEnvVars);
  };

  it('runs doctor command with no flags', async () => {
    const suggestion = 'work smarter, not faster';
    fsExistsSyncStub.returns(true);
    const diagnosticStatus = { testName: 'doctor test', status: 'pass' };
    Doctor.init(oclifConfig);
    diagnosticsRunStub.callsFake(() => {
      const dr = Doctor.getInstance();
      const promise = Lifecycle.getInstance().emit('Doctor:diagnostic', diagnosticStatus);
      dr.addSuggestion(suggestion);
      return [promise];
    });

    const result = await runDoctorCmd([]);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail');
    expect(result.versionDetail).to.deep.equal(getVersionDetailResult(oclifConfig));
    expect(result).to.have.property('cliConfig');
    expect(result.diagnosticResults).to.deep.equal([diagnosticStatus]);
    verifyEnvVars(result);
    verifySuggestions(result, [suggestion]);
    verifyLogFiles(result);
    expect(fsExistsSyncStub.args[0][0]).to.equal(process.cwd());
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(drWriteStdout.called).to.be.false;
    expect(drWriteStderr.called).to.be.false;
    expect(fsWriteFileSyncStub.calledOnce).to.be.true;
    expect(runHookStub.calledTwice).to.be.true;
    expect(runHookStub.args).to.deep.equal([
      ['sf-doctor-@salesforce/plugin-org'],
      ['sf-doctor-@salesforce/plugin-source'],
    ]);
  });

  it('reports on uppercase and lowercase proxy env vars', async () => {
    const httpProxyEnv = ['http_proxy', 'test.http.proxy'];
    const httpsProxyEnv = ['HTTPS_PROXY', 'test.HTTPS.proxy'];
    const noProxyEnv = ['no_proxy', 'test.blah.com'];
    process.env[httpProxyEnv[0]] = httpProxyEnv[1];
    process.env[httpsProxyEnv[0]] = httpsProxyEnv[1];
    process.env[noProxyEnv[0]] = noProxyEnv[1];

    const suggestion = 'work smarter, not faster';
    fsExistsSyncStub.returns(true);
    const diagnosticStatus = { testName: 'doctor test', status: 'pass' };
    Doctor.init(oclifConfig);
    diagnosticsRunStub.callsFake(() => {
      const dr = Doctor.getInstance();
      const promise = Lifecycle.getInstance().emit('Doctor:diagnostic', diagnosticStatus);
      dr.addSuggestion(suggestion);
      return [promise];
    });

    // set proxy env vars
    try {
      const result = await runDoctorCmd([]);
      verifyEnvVars(result, [httpProxyEnv, httpsProxyEnv, noProxyEnv]);
    } finally {
      resetProxyEnvVars();
    }
  });

  it('runs doctor command with outputdir flag (existing dir)', async () => {
    const outputdir = path.resolve('foo', 'bar', 'test');
    fsExistsSyncStub.returns(true);
    Doctor.init(oclifConfig);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);

    const result = await runDoctorCmd(['--outputdir', outputdir]);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail');
    expect(result.versionDetail).to.deep.equal(getVersionDetailResult(oclifConfig));
    expect(result).to.have.property('cliConfig');
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result);
    expect(fsExistsSyncStub.args[0][0]).to.equal(outputdir);
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(fsWriteFileSyncStub.calledOnce).to.be.true;
    expect(drWriteStdout.called).to.be.false;
    expect(drWriteStderr.called).to.be.false;
    expect(runHookStub.callCount, 'Expected runHooks to be called twice').to.equal(2);
    expect(runHookStub.args).to.deep.equal([
      ['sf-doctor-@salesforce/plugin-org'],
      ['sf-doctor-@salesforce/plugin-source'],
    ]);
  });

  it('runs doctor command with outputdir flag (non-existing dir)', async () => {
    const outputdir = path.resolve('foo', 'bar', 'test');
    fsExistsSyncStub.returns(false);
    Doctor.init(oclifConfig);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);

    const result = await runDoctorCmd(['--outputdir', outputdir]);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail');
    expect(result.versionDetail).to.deep.equal(getVersionDetailResult(oclifConfig));
    expect(result).to.have.property('cliConfig');
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result);
    expect(fsExistsSyncStub.args[0][0]).to.equal(outputdir);
    expect(fsMkdirSyncStub.called).to.be.true;
    expect(drWriteStdout.called).to.be.false;
    expect(drWriteStderr.called).to.be.false;
    expect(fsWriteFileSyncStub.calledOnce).to.be.true;
    expect(runHookStub.calledTwice).to.be.true;
    expect(runHookStub.args).to.deep.equal([
      ['sf-doctor-@salesforce/plugin-org'],
      ['sf-doctor-@salesforce/plugin-source'],
    ]);
  });

  it('runs doctor command with command flag (minimal)', async () => {
    const cmd = 'force:org:list --all';
    const expectedCmd = `${oclifConfig.bin} ${cmd} --dev-debug`;
    fsExistsSyncStub.returns(true);
    Doctor.init(oclifConfig);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);
    childProcessExecStub.callsFake((cmdString, opts, cb: () => void) => {
      expect(cmdString).to.equal(expectedCmd);
      expect(opts).to.be.ok;
      cb();
    });

    const result = await runDoctorCmd(['--command', cmd]);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail');
    expect(result.versionDetail).to.deep.equal(getVersionDetailResult(oclifConfig));
    expect(result).to.have.property('cliConfig');
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result, ['-command-stdout.log', '-command-debug.log']);
    expect(fsExistsSyncStub.args[0][0]).to.equal(process.cwd());
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(drWriteStdout.called).to.be.true;
    expect(drWriteStderr.called).to.be.true;
    expect(runHookStub.calledTwice).to.be.true;
    expect(runHookStub.args).to.deep.equal([
      ['sf-doctor-@salesforce/plugin-org'],
      ['sf-doctor-@salesforce/plugin-source'],
    ]);
    expect(result).to.have.property('commandName', expectedCmd);
  });

  it('runs doctor command with command flag (full)', async () => {
    const cmd = `${oclifConfig.bin} force:org:list --all --dev-debug`;
    fsExistsSyncStub.returns(true);
    Doctor.init(oclifConfig);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);
    childProcessExecStub.callsFake((cmdString, opts, cb: () => void) => {
      expect(cmdString).to.equal(cmd);
      expect(opts).to.be.ok;
      cb();
    });

    const result = await runDoctorCmd(['--command', cmd]);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail');
    expect(result.versionDetail).to.deep.equal(getVersionDetailResult(oclifConfig));
    expect(result).to.have.property('cliConfig');
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result, ['-command-stdout.log', '-command-debug.log']);
    expect(fsExistsSyncStub.args[0][0]).to.equal(process.cwd());
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(fsWriteFileSyncStub.calledOnce).to.be.true;
    expect(drWriteStdout.called).to.be.true;
    expect(drWriteStderr.called).to.be.true;
    expect(runHookStub.calledTwice).to.be.true;
    expect(runHookStub.args).to.deep.equal([
      ['sf-doctor-@salesforce/plugin-org'],
      ['sf-doctor-@salesforce/plugin-source'],
    ]);
    expect(result).to.have.property('commandName', cmd);
  });

  it('runs doctor command with plugin flag', async () => {
    fsExistsSyncStub.returns(true);
    Doctor.init(oclifConfig);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);

    const result = await runDoctorCmd(['--plugin', '@salesforce/plugin-org']);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail');
    expect(result.versionDetail).to.deep.equal(getVersionDetailResult(oclifConfig));
    expect(result).to.have.property('cliConfig');
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result);
    expect(fsExistsSyncStub.args[0][0]).to.equal(process.cwd());
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(fsWriteFileSyncStub.calledOnce).to.be.true;
    expect(drWriteStdout.called).to.be.false;
    expect(drWriteStderr.called).to.be.false;
    expect(runHookStub.calledOnce).to.be.true;
    expect(runHookStub.args).to.deep.equal([['sf-doctor-@salesforce/plugin-org']]);
  });

  it('runs doctor command with plugin flag (no plugin tests)', async () => {
    fsExistsSyncStub.returns(true);
    const versionDetail = getVersionDetailStub();
    // @ts-expect-error: stubbing a private property
    oclifConfig.versionDetails = versionDetail;
    Doctor.init(oclifConfig);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);

    const result = await runDoctorCmd(['--plugin', '@salesforce/plugin-data']);

    expect(uxLogStub.called).to.be.true;
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail');
    expect(result.versionDetail).to.deep.equal(getVersionDetailResult(oclifConfig));
    expect(result).to.have.property('cliConfig');
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result);
    expect(fsExistsSyncStub.args[0][0]).to.equal(process.cwd());
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(fsWriteFileSyncStub.calledOnce).to.be.true;
    expect(drWriteStdout.called).to.be.false;
    expect(drWriteStderr.called).to.be.false;
    expect(runHookStub.called).to.be.false;
  });

  it('runs doctor command with createissue flag', async () => {
    fsExistsSyncStub.returns(true);
    const versionDetail = getVersionDetailStub();
    // @ts-expect-error: stubbing a private property
    oclifConfig.versionDetails = versionDetail;
    Doctor.init(oclifConfig);
    diagnosticsRunStub.callsFake(() => [Promise.resolve()]);

    const result = await runDoctorCmd(['--createissue']);

    expect(openStub.firstCall.args[0]).to.not.include('name: Bug report');
    expect(openStub.firstCall.args[0]).to.not.include('Which shell/terminal are you using?');
    expect(uxLogStub.called).to.be.true;
    expect(promptStub.callCount).to.equal(1);
    expect(uxStyledHeaderStub.called).to.be.true;
    expect(result).to.have.property('versionDetail');
    expect(result.versionDetail).to.deep.equal(getVersionDetailResult(oclifConfig));
    expect(result).to.have.property('cliConfig');
    expect(result.diagnosticResults).to.deep.equal([]);
    verifyEnvVars(result);
    verifySuggestions(result);
    verifyLogFiles(result);
    expect(fsExistsSyncStub.args[0][0]).to.equal(process.cwd());
    expect(fsMkdirSyncStub.called).to.be.false;
    expect(drWriteStdout.called).to.be.false;
    expect(drWriteStderr.called).to.be.false;
  });

  it('throws with uninstalled plugin flag', async () => {
    fsExistsSyncStub.returns(true);
    const versionDetail = getVersionDetailStub();
    // @ts-expect-error: stubbing a private property
    oclifConfig.versionDetails = versionDetail;
    Doctor.init(oclifConfig);
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
