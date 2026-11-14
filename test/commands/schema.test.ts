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
import { Config } from '@oclif/core';
import SchemaCmd from '../../src/commands/schema.js';

const makeCommand = (overrides: Record<string, unknown> = {}) => ({
  id: 'test:command',
  summary: 'A test command',
  hidden: false,
  flags: {
    json: { type: 'boolean' as const, name: 'json', hidden: false },
    'flags-dir': { type: 'option' as const, name: 'flags-dir', hidden: false },
    'target-org': {
      type: 'option' as const,
      name: 'target-org',
      summary: 'Username or alias of the target org.',
      char: 'o',
      required: true,
      hidden: false,
    },
    verbose: {
      type: 'boolean' as const,
      name: 'verbose',
      summary: 'Show verbose output.',
      char: 'v',
      required: false,
      hidden: false,
    },
    format: {
      type: 'option' as const,
      name: 'format',
      summary: 'Output format.',
      options: ['json', 'csv', 'table'],
      required: false,
      hidden: false,
    },
    secret: {
      type: 'option' as const,
      name: 'secret',
      hidden: true,
    },
    exclusive1: {
      type: 'boolean' as const,
      name: 'exclusive1',
      exclusive: ['exclusive2'],
      hidden: false,
    },
    exclusive2: {
      type: 'boolean' as const,
      name: 'exclusive2',
      exclusive: ['exclusive1'],
      hidden: false,
    },
    'old-flag': {
      type: 'option' as const,
      name: 'old-flag',
      deprecated: { to: 'new-flag', version: '5.0.0' },
      hidden: false,
    },
  },
  args: {
    file: { name: 'file', description: 'Path to the file.', required: true, hidden: false },
    optionalArg: { name: 'optionalArg', required: false, hidden: false },
  },
  enableJsonFlag: true,
  requiresProject: true,
  ...overrides,
});

const makeDevHubCommand = () =>
  makeCommand({
    id: 'test:devhub',
    flags: {
      json: { type: 'boolean' as const, name: 'json', hidden: false },
      'flags-dir': { type: 'option' as const, name: 'flags-dir', hidden: false },
      'target-dev-hub': {
        type: 'option' as const,
        name: 'target-dev-hub',
        char: 'v',
        required: true,
        hidden: false,
      },
    },
    args: {},
  });

const makeOptionalOrgCommand = () =>
  makeCommand({
    id: 'test:optionalorg',
    flags: {
      json: { type: 'boolean' as const, name: 'json', hidden: false },
      'flags-dir': { type: 'option' as const, name: 'flags-dir', hidden: false },
      'target-org': {
        type: 'option' as const,
        name: 'target-org',
        char: 'o',
        required: false,
        hidden: false,
      },
    },
    args: {},
    requiresProject: false,
  });

const makeErrorCodesCommand = () =>
  makeCommand({
    id: 'test:errorcodes',
    errorCodes: {
      header: 'ERROR CODES',
      body: [
        { name: 'Success (0)', description: 'Completed successfully.' },
        { name: 'AuthError (1)', description: 'Authentication failed.' },
      ],
    },
  });

describe('schema', () => {
  const sandbox = Sinon.createSandbox();
  let oclifConfig: Config;
  const commands = [
    makeCommand(),
    makeCommand({
      id: 'other:command',
      hidden: false,
      requiresProject: false,
      flags: {
        json: { type: 'boolean' as const, name: 'json', hidden: false },
        'flags-dir': { type: 'option' as const, name: 'flags-dir', hidden: false },
      },
      args: {},
    }),
    makeCommand({ id: 'hidden:command', hidden: true }),
    makeErrorCodesCommand(),
    makeDevHubCommand(),
    makeOptionalOrgCommand(),
  ];

  before(() => {
    oclifConfig = fromStub(
      stubInterface<Config>(sandbox, {
        runHook: async () => ({
          successes: [],
          failures: [],
        }),
        commands,
        findCommand: ((id: string) => commands.find((c) => c.id === id)) as Config['findCommand'],
      })
    );
  });

  afterEach(() => {
    sandbox.restore();
  });

  const runSchema = async (params: string[]) => {
    const cmd = new SchemaCmd(params, oclifConfig);
    return cmd.run();
  };

  describe('--command', () => {
    it('returns schema for a command using colon syntax', async () => {
      const result = await runSchema(['--command', 'test:command', '--json']);
      expect(result).to.have.property('command', 'test:command');
      expect(result).to.have.property('requiresProject', true);
      expect(result).to.have.property('requiresOrg', true);
      expect(result).to.have.property('acceptsOrg', true);
      expect(result).to.have.property('enableJsonFlag', true);
    });

    it('returns schema for a command using space syntax', async () => {
      const result = await runSchema(['--command', 'test command', '--json']);
      expect(result).to.have.property('command', 'test:command');
    });

    it('excludes hidden flags and base flags', async () => {
      const result = await runSchema(['--command', 'test:command', '--json']);
      const flags = (result as Record<string, unknown>)['flags'] as Record<string, unknown>;
      expect(flags).to.not.have.property('secret');
      expect(flags).to.not.have.property('json');
      expect(flags).to.not.have.property('flags-dir');
      expect(flags).to.have.property('verbose');
    });

    it('includes flag summary', async () => {
      const result = await runSchema(['--command', 'test:command', '--json']);
      const flags = (result as Record<string, unknown>)['flags'] as Record<string, Record<string, unknown>>;
      expect(flags['verbose']).to.have.property('summary', 'Show verbose output.');
    });

    it('includes flag options enum', async () => {
      const result = await runSchema(['--command', 'test:command', '--json']);
      const flags = (result as Record<string, unknown>)['flags'] as Record<string, Record<string, unknown>>;
      expect(flags['format']).to.have.property('options').that.deep.equals(['json', 'csv', 'table']);
    });

    it('includes flag exclusive relationships', async () => {
      const result = await runSchema(['--command', 'test:command', '--json']);
      const flags = (result as Record<string, unknown>)['flags'] as Record<string, Record<string, unknown>>;
      expect(flags['exclusive1']).to.have.property('exclusive').that.deep.equals(['exclusive2']);
    });

    it('preserves deprecation detail', async () => {
      const result = await runSchema(['--command', 'test:command', '--json']);
      const flags = (result as Record<string, unknown>)['flags'] as Record<string, Record<string, unknown>>;
      expect(flags['old-flag']).to.have.property('deprecated').that.deep.equals({ to: 'new-flag', version: '5.0.0' });
    });

    it('includes args with summary', async () => {
      const result = await runSchema(['--command', 'test:command', '--json']);
      const args = (result as Record<string, unknown>)['args'] as Record<string, Record<string, unknown>>;
      expect(args['file']).to.have.property('required', true);
      expect(args['file']).to.have.property('summary', 'Path to the file.');
      expect(args['optionalArg']).to.not.have.property('required');
    });

    it('handles commands with empty args', async () => {
      const result = await runSchema(['--command', 'other:command', '--json']);
      expect(result).to.have.property('args').that.deep.equals({});
    });

    it('includes error codes when defined', async () => {
      const result = await runSchema(['--command', 'test:errorcodes', '--json']);
      expect(result).to.have.property('errorCodes').with.lengthOf(2);
    });

    it('detects requiresDevHub', async () => {
      const result = await runSchema(['--command', 'test:devhub', '--json']);
      expect(result).to.have.property('requiresDevHub', true);
      expect(result).to.have.property('acceptsDevHub', true);
    });

    it('distinguishes acceptsOrg from requiresOrg', async () => {
      const result = await runSchema(['--command', 'test:optionalorg', '--json']);
      expect(result).to.have.property('requiresOrg', false);
      expect(result).to.have.property('acceptsOrg', true);
    });

    it('throws for unknown commands', async () => {
      try {
        await runSchema(['--command', 'nonexistent', '--json']);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).to.have.property('name', 'CommandNotFoundError');
      }
    });
  });

  describe('command index', () => {
    it('lists all non-hidden commands', async () => {
      const result = await runSchema(['--json']);
      const index = result as { commands: Array<{ id: string }> };
      expect(index.commands).to.be.an('array');
      const ids = index.commands.map((c) => c.id);
      expect(ids).to.include('test:command');
      expect(ids).to.include('other:command');
      expect(ids).to.not.include('hidden:command');
    });

    it('includes requirement and accepts flags in index', async () => {
      const result = await runSchema(['--json']);
      const index = result as {
        commands: Array<{
          id: string;
          requiresProject: boolean;
          requiresOrg: boolean;
          acceptsOrg: boolean;
          requiresDevHub: boolean;
          acceptsDevHub: boolean;
        }>;
      };

      const testCmd = index.commands.find((c) => c.id === 'test:command');
      expect(testCmd).to.have.property('requiresProject', true);
      expect(testCmd).to.have.property('requiresOrg', true);
      expect(testCmd).to.have.property('acceptsOrg', true);

      const otherCmd = index.commands.find((c) => c.id === 'other:command');
      expect(otherCmd).to.have.property('requiresProject', false);
      expect(otherCmd).to.have.property('requiresOrg', false);
      expect(otherCmd).to.have.property('acceptsOrg', false);

      const devHubCmd = index.commands.find((c) => c.id === 'test:devhub');
      expect(devHubCmd).to.have.property('requiresDevHub', true);
      expect(devHubCmd).to.have.property('acceptsDevHub', true);

      const optionalOrgCmd = index.commands.find((c) => c.id === 'test:optionalorg');
      expect(optionalOrgCmd).to.have.property('requiresOrg', false);
      expect(optionalOrgCmd).to.have.property('acceptsOrg', true);
    });
  });
});
