/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect, use as chaiUse } from 'chai';
import * as Sinon from 'sinon';
import * as SinonChai from 'sinon-chai';
import { fromStub, stubInterface, stubMethod } from '@salesforce/ts-sinon';
import { IConfig } from '@oclif/config';
import { UX } from '@salesforce/command';
import * as getInfoConfig from '../../../../src/shared/getInfoConfig';
import * as getReleaseNotes from '../../../../src/shared/getReleaseNotes';
import * as getDistTagVersion from '../../../../src/shared/getDistTagVersion';
import Display from '../../../../src/commands/info/releasenotes/display';

chaiUse(SinonChai);

describe('info:releasenotes:display', () => {
  const sandbox = Sinon.createSandbox();

  let mockInfoConfig: getInfoConfig.InfoConfig;
  let uxLogStub: sinon.SinonStub;
  let uxWarnStub: sinon.SinonStub;
  let getInfoConfigStub: Sinon.SinonStub;
  let getReleaseNotesStub: Sinon.SinonStub;
  let getDistTagVersionStub: Sinon.SinonStub;

  const oclifConfigStub = fromStub(stubInterface<IConfig>(sandbox));

  class TestDisplay extends Display {
    public async runIt() {
      await this.init();
      return this.run();
    }
  }

  const runDisplayCmd = async (params: string[]) => {
    const cmd = new TestDisplay(params, oclifConfigStub);

    uxLogStub = stubMethod(sandbox, UX.prototype, 'log');
    uxWarnStub = stubMethod(sandbox, UX.prototype, 'warn');

    return cmd.runIt();
  };
  let suppressEnvVarBackup;

  beforeEach(() => {
    mockInfoConfig = {
      releasenotes: {
        distTagUrl: 'https://registry.npmjs.org/-/package/sfdx-cli/dist-tags',
        releaseNotesPath: 'https://raw.githubusercontent.com/forcedotcom/cli/main/releasenotes/sfdx',
        releaseNotesFilename: 'README.md',
      },
    };

    oclifConfigStub.pjson.version = '3.3.3';
    oclifConfigStub.root = '/root/path';

    suppressEnvVarBackup = process.env.PLUGIN_INFO_HIDE_RELEASE_NOTES;

    getInfoConfigStub = stubMethod(sandbox, getInfoConfig, 'getInfoConfig').returns(mockInfoConfig);
    getReleaseNotesStub = stubMethod(sandbox, getReleaseNotes, 'getReleaseNotes').returns('release-notes');
    getDistTagVersionStub = stubMethod(sandbox, getDistTagVersion, 'getDistTagVersion').returns('1.2.3');
  });

  afterEach(() => {
    getInfoConfigStub.restore();
    getReleaseNotesStub.restore();
    getDistTagVersionStub.restore();
    sandbox.restore();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    process.env.PLUGIN_INFO_HIDE_RELEASE_NOTES = suppressEnvVarBackup;
  });

  it('logs release notes', async () => {
    await runDisplayCmd([]);

    expect(uxLogStub.args[0][0]).to.equal('release-notes');
  });

  it('allows you to suppress release notes output with env var', async () => {
    process.env.PLUGIN_INFO_HIDE_RELEASE_NOTES = 'true';

    await runDisplayCmd([]);

    expect(uxLogStub.called).to.be.false;
    expect(uxWarnStub.called).to.be.false;
  });

  it('calls getInfoConfig with config root', async () => {
    await runDisplayCmd([]);

    expect(getInfoConfigStub.args[0][0]).to.equal('/root/path');
  });

  it('logs warning if info config lookup fails', async () => {
    getInfoConfigStub.throws(new Error('info config error'));

    await runDisplayCmd([]);

    expect(uxWarnStub.args[0][0]).to.contain('info config error');
  });

  it('does not call getDistTagVersion if helper is not passed', async () => {
    await runDisplayCmd([]);

    expect(getDistTagVersionStub.called).to.be.false;
  });

  it('calls getDistTagVersion with correct are if helpers are used', async () => {
    await runDisplayCmd(['-v', 'latest-rc']);

    expect(getDistTagVersionStub.args[0]).to.deep.equal([mockInfoConfig.releasenotes.distTagUrl, 'latest-rc']);
  });

  it('logs a warning if dist tag lookup fails', async () => {
    getDistTagVersionStub.throws(new Error('dist tag error'));

    await runDisplayCmd(['-v', 'latest-rc']);

    expect(uxWarnStub.args[0][0]).to.contain('dist tag error');
  });

  it('calls getReleaseNotes with version returned from getDistTagVersion', async () => {
    await runDisplayCmd(['-v', 'latest-rc']);

    const expected = [
      mockInfoConfig.releasenotes.releaseNotesPath,
      mockInfoConfig.releasenotes.releaseNotesFilename,
      '1.2.3',
    ];

    expect(getReleaseNotesStub.args[0]).to.deep.equal(expected);
  });

  it('calls getReleaseNotes with passed version', async () => {
    await runDisplayCmd(['-v', '4.5.6']);

    expect(getReleaseNotesStub.args[0][2]).to.equal('4.5.6');
  });

  it('calls getReleaseNotes with installed version if no arg is passed', async () => {
    await runDisplayCmd([]);

    expect(getReleaseNotesStub.args[0][2]).to.equal('3.3.3');
  });

  it('logs a warning if getReleaseNotes lookup fails', async () => {
    getReleaseNotesStub.throws(new Error('release notes error'));

    await runDisplayCmd([]);

    expect(uxWarnStub.args[0][0]).to.contain('release notes error');
  });
});
