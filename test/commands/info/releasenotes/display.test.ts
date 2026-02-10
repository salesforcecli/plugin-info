/*
 * Copyright 2026, Salesforce, Inc.
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

import os from 'node:os';
import Sinon from 'sinon';
import SinonChai from 'sinon-chai';
import { expect, use as chaiUse } from 'chai';
import { fromStub, stubInterface, stubMethod, spyMethod } from '@salesforce/ts-sinon';
import { shouldThrow } from '@salesforce/core/testSetup';
import { marked } from 'marked';
import { Env } from '@salesforce/kit';
import { Lifecycle } from '@salesforce/core';
import { Config } from '@oclif/core';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { InfoConfig } from '../../../../src/shared/getInfoConfig.js';
import shared from '../../../../src/shared/index.js';
import Display from '../../../../src/commands/info/releasenotes/display.js';

chaiUse(SinonChai);

describe('sfdx info:releasenotes:display', () => {
  const sandbox = Sinon.createSandbox();

  let mockInfoConfig: InfoConfig;
  let getBooleanStub: sinon.SinonStub;
  let uxLogStub: sinon.SinonStub;
  let uxWarnStub: sinon.SinonStub;
  let getInfoConfigStub: Sinon.SinonStub;
  let getReleaseNotesStub: Sinon.SinonStub;
  let getDistTagVersionStub: Sinon.SinonStub;
  let parseReleaseNotesSpy: Sinon.SinonSpy;
  let markedParserSpy: Sinon.SinonSpy;

  const oclifConfigStub = fromStub(
    stubInterface<Config>(sandbox, {
      runHook: async () => ({
        successes: [],
        failures: [],
      }),
      bin: 'sfdx',
    })
  );

  const runDisplayCmd = async (params: string[]) => {
    const cmd = new Display(params, oclifConfigStub);

    uxLogStub = stubMethod(sandbox, SfCommand.prototype, 'log');
    uxWarnStub = stubMethod(sandbox, SfCommand.prototype, 'warn');

    return cmd.run();
  };

  beforeEach(() => {
    mockInfoConfig = {
      releasenotes: {
        distTagUrl: 'https://registry.npmjs.org/-/package/sfdx-cli/dist-tags',
        releaseNotesPath: 'https://github.com/forcedotcom/cli/tree/main/releasenotes/sfdx',
        releaseNotesFilename: 'README.md',
      },
    };

    oclifConfigStub.pjson.version = '3.3.3';
    oclifConfigStub.root = '/root/path';

    getBooleanStub = stubMethod(sandbox, Env.prototype, 'getBoolean');
    getBooleanStub.withArgs('SFDX_HIDE_RELEASE_NOTES').returns(false);
    getBooleanStub.withArgs('SFDX_HIDE_RELEASE_NOTES_FOOTER').returns(false);

    getInfoConfigStub = stubMethod(sandbox, shared, 'getInfoConfig').returns(mockInfoConfig);
    getReleaseNotesStub = stubMethod(sandbox, shared, 'getReleaseNotes').returns('## Release notes for 3.3.3');
    getDistTagVersionStub = stubMethod(sandbox, shared, 'getDistTagVersion').returns('1.2.3');
    parseReleaseNotesSpy = spyMethod(sandbox, shared, 'parseReleaseNotes');
    markedParserSpy = spyMethod(sandbox, marked, 'parser');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('allows you to suppress release notes output with env var', async () => {
    // This env var is only honored when the --hook flag is passed.
    // If someone is running the command directly, we show notes regardless.
    getBooleanStub.withArgs('SFDX_HIDE_RELEASE_NOTES').returns(true);

    const lifecycleStub = stubMethod(sandbox, Lifecycle.prototype, 'emitTelemetry');

    await runDisplayCmd(['--hook']);

    expect(lifecycleStub.calledOnce).to.equal(true);
    expect(uxLogStub.called).to.be.false;
    expect(uxWarnStub.called).to.be.false;
  });

  it('ignores hide release notes env var if running command directly (without --hook)', async () => {
    getBooleanStub.withArgs('SFDX_HIDE_RELEASE_NOTES').returns(true);

    await runDisplayCmd([]);

    expect(uxLogStub.args[0][0]).to.contain('## Release notes for 3.3.3');
  });

  it('calls getInfoConfig with config root', async () => {
    await runDisplayCmd([]);

    expect(getInfoConfigStub.args[0][0]).to.equal('/root/path');
  });

  it('does not render emoji', async () => {
    getReleaseNotesStub.returns('## 3.3.3 :tada:');

    await runDisplayCmd([]);

    expect(uxLogStub.args[0][0]).to.contain('## 3.3.3 :tada:');
  });

  it('throws an error if info config lookup fails', async () => {
    getInfoConfigStub.throws(new Error('info config error'));

    try {
      await shouldThrow(runDisplayCmd([]));
    } catch (err) {
      expect((err as Error).message).to.contain('info config error');
    }
  });

  it('does not call getDistTagVersion if helper is not passed', async () => {
    await runDisplayCmd([]);

    expect(getDistTagVersionStub.called).to.be.false;
  });

  it('calls getDistTagVersion with correct are if helpers are used', async () => {
    await runDisplayCmd(['-v', 'latest-rc', '--hook']);

    expect(getDistTagVersionStub.args[0]).to.deep.equal([mockInfoConfig.releasenotes.distTagUrl, 'latest-rc']);
  });

  it('throws an error if dist tag lookup fails', async () => {
    getDistTagVersionStub.throws(new Error('dist tag error'));

    try {
      await shouldThrow(runDisplayCmd(['-v', 'latest-rc']));
    } catch (err) {
      expect((err as Error).message).to.contain('dist tag error');
    }
  });

  it('calls getReleaseNotes with version returned from getDistTagVersion', async () => {
    await runDisplayCmd(['-v', 'latest-rc', '--hook']);

    const expected = [
      mockInfoConfig.releasenotes.releaseNotesPath,
      mockInfoConfig.releasenotes.releaseNotesFilename,
      '1.2.3',
    ];

    expect(getReleaseNotesStub.args[0]).to.deep.equal(expected);
  });

  it('logs logs a header with cli bin', async () => {
    await runDisplayCmd([]);

    expect(uxLogStub.args[0][0]).to.contain("# Release notes for 'sfdx':");
  });

  it('calls getReleaseNotes with passed version', async () => {
    await runDisplayCmd(['-v', '4.5.6', '--hook']);

    expect(getReleaseNotesStub.args[0][2]).to.equal('4.5.6');
  });

  it('calls getReleaseNotes with installed version if no arg is passed', async () => {
    await runDisplayCmd([]);

    expect(getReleaseNotesStub.args[0][2]).to.equal('3.3.3');
  });

  it('throws an error if getReleaseNotes lookup fails', async () => {
    getReleaseNotesStub.throws(new Error('release notes error'));

    try {
      await shouldThrow(runDisplayCmd([]));
    } catch (err) {
      expect((err as Error).message).to.contain('release notes error');
    }
  });

  it('parseReleaseNotes is called with the correct args', async () => {
    await runDisplayCmd([]);

    expect(parseReleaseNotesSpy.args[0]).to.deep.equal([
      '## Release notes for 3.3.3',
      '3.3.3',
      mockInfoConfig.releasenotes.releaseNotesPath,
    ]);
  });

  it('parser is called with tokens', async () => {
    await runDisplayCmd([]);

    const tokens = parseReleaseNotesSpy.returnValues[0] as marked.Token;

    expect(markedParserSpy.calledOnce).to.be.true;
    expect(markedParserSpy.args[0][0]).to.deep.equal(tokens);
  });

  it('logs markdown on the command line', async () => {
    await runDisplayCmd([]);

    expect(uxLogStub.args[0][0]).to.contain('## Release notes for 3.3.3');
  });

  it('throws an error if parsing fails', async () => {
    try {
      await shouldThrow(runDisplayCmd(['-v', '4.5.6']));
    } catch (err) {
      expect((err as Error).message).to.contain(
        `Didn't find version '4.5.6'. View release notes online at: ${mockInfoConfig.releasenotes.releaseNotesPath}`
      );
    }
  });

  it('does not throw an error if --hook is set', async () => {
    getReleaseNotesStub.throws(new Error('release notes error'));
    const lifecycleStub = stubMethod(sandbox, Lifecycle.prototype, 'emitTelemetry');

    await runDisplayCmd(['--hook']);
    expect(lifecycleStub.calledOnce).to.be.true;
    expect(uxWarnStub.args[0][0]).to.contain('release notes error');
  });

  it('renders a footer if --hook is set', async () => {
    await runDisplayCmd(['--hook']);

    expect(uxLogStub.args[1][0]).to.contain('to manually view the current release notes');
  });

  it('hides footer if env var is set', async () => {
    getBooleanStub.withArgs('SFDX_HIDE_RELEASE_NOTES_FOOTER').returns(true);

    const lifecycleStub = stubMethod(sandbox, Lifecycle.prototype, 'emitTelemetry');

    await runDisplayCmd(['--hook']);
    expect(lifecycleStub.calledOnce).to.be.true;
    expect(uxLogStub.args[2]).to.be.undefined;
  });

  it('supports json output', async () => {
    const json = await runDisplayCmd(['--json']);

    const expected = {
      body: `# Release notes for 'sfdx':${os.EOL}## Release notes for 3.3.3`,
      url: mockInfoConfig.releasenotes.releaseNotesPath,
    };

    expect(json).to.deep.equal(expected);
  });
});

describe('sf info:releasenotes:display', () => {
  const sandbox = Sinon.createSandbox();

  let mockInfoConfig: InfoConfig;
  let getBooleanStub: sinon.SinonStub;
  let uxLogStub: sinon.SinonStub;
  let uxWarnStub: sinon.SinonStub;
  let getInfoConfigStub: Sinon.SinonStub;
  let getReleaseNotesStub: Sinon.SinonStub;
  let getDistTagVersionStub: Sinon.SinonStub;
  let parseReleaseNotesSpy: Sinon.SinonSpy;
  let markedParserSpy: Sinon.SinonSpy;

  const oclifConfigStub = fromStub(
    stubInterface<Config>(sandbox, {
      runHook: async () => ({
        successes: [],
        failures: [],
      }),
      bin: 'sf',
    })
  );

  const runDisplayCmd = async (params: string[]) => {
    const cmd = new Display(params, oclifConfigStub);

    uxLogStub = stubMethod(sandbox, SfCommand.prototype, 'log');
    uxWarnStub = stubMethod(sandbox, SfCommand.prototype, 'warn');

    return cmd.run();
  };

  beforeEach(() => {
    mockInfoConfig = {
      releasenotes: {
        distTagUrl: 'https://registry.npmjs.org/-/package/sfdx-cli/dist-tags',
        releaseNotesPath: 'https://github.com/forcedotcom/cli/tree/main/releasenotes/sfdx',
        releaseNotesFilename: 'README.md',
      },
    };

    oclifConfigStub.pjson.version = '3.3.3';
    oclifConfigStub.root = '/root/path';

    getBooleanStub = stubMethod(sandbox, Env.prototype, 'getBoolean');
    getBooleanStub.withArgs('SF_HIDE_RELEASE_NOTES').returns(false);
    getBooleanStub.withArgs('SF_HIDE_RELEASE_NOTES_FOOTER').returns(false);

    getInfoConfigStub = stubMethod(sandbox, shared, 'getInfoConfig').returns(mockInfoConfig);
    getReleaseNotesStub = stubMethod(sandbox, shared, 'getReleaseNotes').returns('## Release notes for 3.3.3');
    getDistTagVersionStub = stubMethod(sandbox, shared, 'getDistTagVersion').returns('1.2.3');
    parseReleaseNotesSpy = spyMethod(sandbox, shared, 'parseReleaseNotes');
    markedParserSpy = spyMethod(sandbox, marked, 'parser');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('allows you to suppress release notes output with env var', async () => {
    // This env var is only honored when the --hook flag is passed.
    // If someone is running the command directly, we show notes regardless.
    getBooleanStub.withArgs('SF_HIDE_RELEASE_NOTES').returns(true);

    const lifecycleStub = stubMethod(sandbox, Lifecycle.prototype, 'emitTelemetry');

    await runDisplayCmd(['--hook']);

    expect(lifecycleStub.calledOnce).to.equal(true);
    expect(uxLogStub.called).to.be.false;
    expect(uxWarnStub.called).to.be.false;
  });

  it('ignores hide release notes env var if running command directly (without --hook)', async () => {
    getBooleanStub.withArgs('SF_HIDE_RELEASE_NOTES').returns(true);

    await runDisplayCmd([]);

    expect(uxLogStub.args[0][0]).to.contain('## Release notes for 3.3.3');
  });

  it('calls getInfoConfig with config root', async () => {
    await runDisplayCmd([]);

    expect(getInfoConfigStub.args[0][0]).to.equal('/root/path');
  });

  it('does not render emoji', async () => {
    getReleaseNotesStub.returns('## 3.3.3 :tada:');

    await runDisplayCmd([]);

    expect(uxLogStub.args[0][0]).to.contain('## 3.3.3 :tada:');
  });

  it('throws an error if info config lookup fails', async () => {
    getInfoConfigStub.throws(new Error('info config error'));

    try {
      await shouldThrow(runDisplayCmd([]));
    } catch (err) {
      expect((err as Error).message).to.contain('info config error');
    }
  });

  it('does not call getDistTagVersion if helper is not passed', async () => {
    await runDisplayCmd([]);

    expect(getDistTagVersionStub.called).to.be.false;
  });

  it('calls getDistTagVersion with correct are if helpers are used', async () => {
    await runDisplayCmd(['-v', 'latest-rc', '--hook']);

    expect(getDistTagVersionStub.args[0]).to.deep.equal([mockInfoConfig.releasenotes.distTagUrl, 'latest-rc']);
  });

  it('throws an error if dist tag lookup fails', async () => {
    getDistTagVersionStub.throws(new Error('dist tag error'));

    try {
      await shouldThrow(runDisplayCmd(['-v', 'latest-rc']));
    } catch (err) {
      expect((err as Error).message).to.contain('dist tag error');
    }
  });

  it('calls getReleaseNotes with version returned from getDistTagVersion', async () => {
    await runDisplayCmd(['-v', 'latest-rc', '--hook']);

    const expected = [
      mockInfoConfig.releasenotes.releaseNotesPath,
      mockInfoConfig.releasenotes.releaseNotesFilename,
      '1.2.3',
    ];

    expect(getReleaseNotesStub.args[0]).to.deep.equal(expected);
  });

  it('logs logs a header with cli bin', async () => {
    await runDisplayCmd([]);

    expect(uxLogStub.args[0][0]).to.contain("# Release notes for 'sf':");
  });

  it('calls getReleaseNotes with passed version', async () => {
    await runDisplayCmd(['-v', '4.5.6', '--hook']);

    expect(getReleaseNotesStub.args[0][2]).to.equal('4.5.6');
  });

  it('calls getReleaseNotes with installed version if no arg is passed', async () => {
    await runDisplayCmd([]);

    expect(getReleaseNotesStub.args[0][2]).to.equal('3.3.3');
  });

  it('throws an error if getReleaseNotes lookup fails', async () => {
    getReleaseNotesStub.throws(new Error('release notes error'));

    try {
      await shouldThrow(runDisplayCmd([]));
    } catch (err) {
      expect((err as Error).message).to.contain('release notes error');
    }
  });

  it('parseReleaseNotes is called with the correct args', async () => {
    await runDisplayCmd([]);

    expect(parseReleaseNotesSpy.args[0]).to.deep.equal([
      '## Release notes for 3.3.3',
      '3.3.3',
      mockInfoConfig.releasenotes.releaseNotesPath,
    ]);
  });

  it('parser is called with tokens', async () => {
    await runDisplayCmd([]);

    const tokens = parseReleaseNotesSpy.returnValues[0] as marked.Token;

    expect(markedParserSpy.calledOnce).to.be.true;
    expect(markedParserSpy.args[0][0]).to.deep.equal(tokens);
  });

  it('logs markdown on the command line', async () => {
    await runDisplayCmd([]);

    expect(uxLogStub.args[0][0]).to.contain('## Release notes for 3.3.3');
  });

  it('throws an error if parsing fails', async () => {
    try {
      await shouldThrow(runDisplayCmd(['-v', '4.5.6']));
    } catch (err) {
      expect((err as Error).message).to.contain(
        `Didn't find version '4.5.6'. View release notes online at: ${mockInfoConfig.releasenotes.releaseNotesPath}`
      );
    }
  });

  it('does not throw an error if --hook is set', async () => {
    getReleaseNotesStub.throws(new Error('release notes error'));
    const lifecycleStub = stubMethod(sandbox, Lifecycle.prototype, 'emitTelemetry');

    await runDisplayCmd(['--hook']);
    expect(lifecycleStub.calledOnce).to.be.true;
    expect(uxWarnStub.args[0][0]).to.contain('release notes error');
  });

  it('renders a footer if --hook is set', async () => {
    await runDisplayCmd(['--hook']);

    expect(uxLogStub.args[1][0]).to.contain('to manually view the current release notes');
  });

  it('hides footer if env var is set', async () => {
    getBooleanStub.withArgs('SF_HIDE_RELEASE_NOTES_FOOTER').returns(true);

    const lifecycleStub = stubMethod(sandbox, Lifecycle.prototype, 'emitTelemetry');

    await runDisplayCmd(['--hook']);
    expect(lifecycleStub.calledOnce).to.be.true;
    expect(uxLogStub.args[2]).to.be.undefined;
  });

  it('supports json output', async () => {
    const json = await runDisplayCmd(['--json']);

    const expected = {
      body: `# Release notes for 'sf':${os.EOL}## Release notes for 3.3.3`,
      url: mockInfoConfig.releasenotes.releaseNotesPath,
    };

    expect(json).to.deep.equal(expected);
  });
});
