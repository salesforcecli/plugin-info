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

import Sinon from 'sinon';
import { expect } from 'chai';
import { fromStub, stubInterface } from '@salesforce/ts-sinon';
import { AuthInfo, ConfigAggregator, SfProject, OrgConfigProperties, StateAggregator } from '@salesforce/core';
import { Config, Interfaces } from '@oclif/core';
import StatusCmd from '../../src/commands/status.js';

const makeVersionDetails = (overrides?: Partial<Interfaces.VersionDetails>): Interfaces.VersionDetails => ({
  cliVersion: 'sf/2.50.0',
  architecture: 'darwin-arm64',
  nodeVersion: 'node-v22.0.0',
  osVersion: 'Darwin 25.0.0',
  shell: 'zsh',
  rootPath: '/usr/local/lib/sf',
  pluginVersions: {
    '@salesforce/plugin-org': { version: '5.0.0', type: 'core', root: '/path/to/org' },
    '@salesforce/plugin-source': { version: '3.2.0', type: 'core', root: '/path/to/source' },
  },
  ...overrides,
});

describe('status', () => {
  const sandbox = Sinon.createSandbox();
  let oclifConfig: Config;
  let configAggregatorStub: Sinon.SinonStub;
  let authInfoCreateStub: Sinon.SinonStub;
  let projectGetInstanceStub: Sinon.SinonStub;

  const mockConfigAggregator = {
    getInfo: (key: string) => {
      const values: Record<
        string,
        { value: string | null; isLocal: () => boolean; isGlobal: () => boolean; isEnvVar: () => boolean }
      > = {
        [OrgConfigProperties.TARGET_ORG]: {
          value: 'my-scratch-org',
          isLocal: () => true,
          isGlobal: () => false,
          isEnvVar: () => false,
        },
        [OrgConfigProperties.TARGET_DEV_HUB]: {
          value: 'devhub@example.com',
          isLocal: () => false,
          isGlobal: () => true,
          isEnvVar: () => false,
        },
        [OrgConfigProperties.ORG_API_VERSION]: {
          value: null,
          isLocal: () => false,
          isGlobal: () => false,
          isEnvVar: () => false,
        },
        [OrgConfigProperties.ORG_INSTANCE_URL]: {
          value: null,
          isLocal: () => false,
          isGlobal: () => false,
          isEnvVar: () => false,
        },
      };
      return values[key] ?? { value: null, isLocal: () => false, isGlobal: () => false, isEnvVar: () => false };
    },
  };

  const noConfigAggregator = {
    getInfo: () => ({ value: null, isLocal: () => false, isGlobal: () => false, isEnvVar: () => false }),
  };

  const mockStateAggregator = {
    aliases: {
      resolveUsername: (input: string) => {
        if (input === 'my-scratch-org') return 'user@test.org';
        return input;
      },
    },
  };

  const mockAuthFields: Record<string, Record<string, unknown>> = {
    'user@test.org': {
      orgId: '00D000000000001',
      instanceUrl: 'https://test.salesforce.com',
      devHubUsername: 'devhub@example.com',
      isDevHub: false,
      accessToken: '00D!SECRET_TOKEN',
    },
    'devhub@example.com': {
      orgId: '00D000000000002',
      instanceUrl: 'https://login.salesforce.com',
      isDevHub: true,
    },
  };

  before(() => {
    oclifConfig = fromStub(
      stubInterface<Config>(sandbox, {
        runHook: async () => ({
          successes: [],
          failures: [],
        }),
        versionDetails: makeVersionDetails(),
        commands: [],
      })
    );
  });

  beforeEach(() => {
    configAggregatorStub = sandbox
      .stub(ConfigAggregator, 'create')
      .resolves(mockConfigAggregator as unknown as ConfigAggregator);
    sandbox.stub(StateAggregator, 'getInstance').resolves(mockStateAggregator as unknown as StateAggregator);
    authInfoCreateStub = sandbox.stub(AuthInfo, 'create').callsFake(async (opts) => {
      const username = (opts as { username: string }).username;
      const fields = mockAuthFields[username] ?? {};
      return { getFields: () => fields } as unknown as AuthInfo;
    });
    projectGetInstanceStub = sandbox.stub(SfProject, 'getInstance');
  });

  afterEach(() => {
    sandbox.restore();
  });

  const runStatus = async (params: string[] = []) => {
    const cmd = new StatusCmd(params, oclifConfig);
    return cmd.run();
  };

  it('returns config values with location', async () => {
    projectGetInstanceStub.throws(new Error('InvalidProjectWorkspaceError'));
    const result = await runStatus();

    expect(result.config).to.have.property('target-org');
    expect(result.config['target-org']).to.deep.equal({ value: 'my-scratch-org', location: 'local' });
    expect(result.config).to.have.property('target-dev-hub');
    expect(result.config['target-dev-hub']).to.deep.equal({ value: 'devhub@example.com', location: 'global' });
  });

  it('omits config keys with null values', async () => {
    projectGetInstanceStub.throws(new Error('InvalidProjectWorkspaceError'));
    const result = await runStatus();

    expect(result.config).to.not.have.property('org-api-version');
    expect(result.config).to.not.have.property('org-instance-url');
  });

  it('resolves target-org with alias to org details', async () => {
    projectGetInstanceStub.throws(new Error('InvalidProjectWorkspaceError'));
    const result = await runStatus();

    expect(result.targetOrg).to.not.be.undefined;
    expect(result.targetOrg!.username).to.equal('user@test.org');
    expect(result.targetOrg!.alias).to.equal('my-scratch-org');
    expect(result.targetOrg!.orgId).to.equal('00D000000000001');
    expect(result.targetOrg!.instanceUrl).to.equal('https://test.salesforce.com');
    expect(result.targetOrg!.isScratchOrg).to.equal(true);
  });

  it('resolves target-dev-hub to org details', async () => {
    projectGetInstanceStub.throws(new Error('InvalidProjectWorkspaceError'));
    const result = await runStatus();

    expect(result.targetDevHub).to.not.be.undefined;
    expect(result.targetDevHub!.username).to.equal('devhub@example.com');
    expect(result.targetDevHub!.alias).to.be.undefined;
    expect(result.targetDevHub!.orgId).to.equal('00D000000000002');
    expect(result.targetDevHub!.isDevHub).to.equal(true);
  });

  it('omits targetOrg when no target-org is configured', async () => {
    configAggregatorStub.resolves(noConfigAggregator);
    projectGetInstanceStub.throws(new Error('InvalidProjectWorkspaceError'));
    const result = await runStatus();

    expect(result.targetOrg).to.be.undefined;
    expect(result.targetDevHub).to.be.undefined;
  });

  it('returns error details when org auth fails', async () => {
    authInfoCreateStub.rejects(new Error('INVALID_GRANT: expired access/refresh token'));
    projectGetInstanceStub.throws(new Error('InvalidProjectWorkspaceError'));
    const result = await runStatus();

    expect(result.targetOrg).to.not.be.undefined;
    expect(result.targetOrg!.username).to.equal('my-scratch-org');
    expect(result.targetOrg!.error).to.equal('INVALID_GRANT: expired access/refresh token');
  });

  it('never exposes accessToken in org details', async () => {
    projectGetInstanceStub.throws(new Error('InvalidProjectWorkspaceError'));
    const result = await runStatus();

    expect(result.targetOrg).to.not.have.property('accessToken');
    expect(JSON.stringify(result)).to.not.include('SECRET_TOKEN');
  });

  it('returns project info when in a project', async () => {
    const mockProject = {
      getPath: () => '/Users/test/my-project',
      getSfProjectJson: () => ({
        getContents: () => ({
          namespace: 'myNs',
          sourceApiVersion: '60.0',
        }),
      }),
      getPackageDirectories: () => [
        { path: 'force-app', default: true, name: 'force-app', fullPath: '/Users/test/my-project/force-app' },
        { path: 'utils', name: 'utils', fullPath: '/Users/test/my-project/utils' },
      ],
    };
    projectGetInstanceStub.returns(mockProject);
    const result = await runStatus();

    expect(result.project).to.not.be.undefined;
    expect(result.project!.path).to.equal('/Users/test/my-project');
    expect(result.project!.namespace).to.equal('myNs');
    expect(result.project!.sourceApiVersion).to.equal('60.0');
    expect(result.project!.packageDirectories).to.have.lengthOf(2);
    expect(result.project!.packageDirectories[0]).to.deep.equal({ path: 'force-app', default: true });
  });

  it('returns undefined project when not in a project', async () => {
    projectGetInstanceStub.throws(new Error('InvalidProjectWorkspaceError'));
    const result = await runStatus();

    expect(result.project).to.be.undefined;
  });

  it('returns CLI version info', async () => {
    projectGetInstanceStub.throws(new Error('InvalidProjectWorkspaceError'));
    const result = await runStatus();

    expect(result.cli).to.have.property('version', 'sf/2.50.0');
    expect(result.cli).to.have.property('node', 'node-v22.0.0');
    expect(result.cli).to.have.property('os', 'Darwin 25.0.0');
    expect(result.cli).to.have.property('shell', 'zsh');
    expect(result.cli).to.have.property('arch', 'darwin-arm64');
  });

  it('includes tracksSource and expirationDate when present', async () => {
    authInfoCreateStub.restore();
    sandbox.stub(AuthInfo, 'create').callsFake(async (opts) => {
      const username = (opts as { username: string }).username;
      if (username === 'user@test.org') {
        return {
          getFields: () => ({
            orgId: '00D000000000001',
            instanceUrl: 'https://test.salesforce.com',
            devHubUsername: 'devhub@example.com',
            tracksSource: true,
            expirationDate: '2026-09-20',
          }),
        } as AuthInfo;
      }
      return { getFields: () => ({}) } as AuthInfo;
    });
    projectGetInstanceStub.throws(new Error('InvalidProjectWorkspaceError'));
    const result = await runStatus();

    expect(result.targetOrg!.tracksSource).to.equal(true);
    expect(result.targetOrg!.expirationDate).to.equal('2026-09-20');
  });

  it('surfaces defaultPackagePath from project', async () => {
    const mockProject = {
      getPath: () => '/Users/test/my-project',
      getSfProjectJson: () => ({
        getContents: () => ({}),
      }),
      getPackageDirectories: () => [
        { path: 'force-app', default: true, name: 'force-app', fullPath: '/Users/test/my-project/force-app' },
        { path: 'utils', name: 'utils', fullPath: '/Users/test/my-project/utils' },
      ],
    };
    projectGetInstanceStub.returns(mockProject);
    const result = await runStatus();

    expect(result.project!.defaultPackagePath).to.equal('force-app');
  });

  it('reports env var config location', async () => {
    const envConfigAggregator = {
      getInfo: (key: string) => {
        if (key === (OrgConfigProperties.TARGET_ORG as string)) {
          return {
            value: 'env-org',
            isLocal: () => false,
            isGlobal: () => false,
            isEnvVar: () => true,
          };
        }
        return { value: null, isLocal: () => false, isGlobal: () => false, isEnvVar: () => false };
      },
    };
    configAggregatorStub.resolves(envConfigAggregator);
    projectGetInstanceStub.throws(new Error('InvalidProjectWorkspaceError'));
    const result = await runStatus();

    expect(result.config['target-org']).to.deep.equal({ value: 'env-org', location: 'environment' });
  });
});
