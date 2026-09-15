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

import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { Messages, SfError } from '@salesforce/core';
// eslint-disable-next-line sf-plugin/no-oclif-flags-command-import
import type { Command } from '@oclif/core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-info', 'schema');

const BASE_FLAGS = new Set(['json', 'flags-dir']);

type Deprecation = {
  to?: string;
  message?: string;
  version?: string | number;
};

type FlagSchema = {
  type: 'boolean' | 'option';
  summary?: string;
  char?: string;
  required?: boolean;
  multiple?: boolean;
  helpValue?: string | string[];
  options?: readonly string[];
  delimiter?: string;
  exclusive?: string[];
  dependsOn?: string[];
  exactlyOne?: string[];
  atLeastOne?: string[];
  deprecated?: true | Deprecation;
};

type ArgSchema = {
  summary?: string;
  required?: boolean;
  options?: readonly string[];
  multiple?: boolean;
};

export type CommandSchema = {
  command: string;
  summary?: string;
  requiresProject: boolean;
  requiresOrg: boolean;
  acceptsOrg: boolean;
  requiresDevHub: boolean;
  acceptsDevHub: boolean;
  enableJsonFlag: boolean;
  flags: Record<string, FlagSchema>;
  args: Record<string, ArgSchema>;
  errorCodes?: Array<{ name: string; description: string }>;
};

export type CommandIndex = {
  commands: Array<{
    id: string;
    summary?: string;
    requiresProject: boolean;
    requiresOrg: boolean;
    acceptsOrg: boolean;
    requiresDevHub: boolean;
    acceptsDevHub: boolean;
  }>;
};

export type SchemaResult = CommandSchema | CommandIndex;

function addRelationships(schema: FlagSchema, flag: Command.Flag.Cached): void {
  if (flag.exclusive?.length) schema.exclusive = flag.exclusive;
  if (flag.dependsOn?.length) schema.dependsOn = flag.dependsOn;
  if (flag.exactlyOne?.length) schema.exactlyOne = flag.exactlyOne;
  if (flag.atLeastOne?.length) schema.atLeastOne = flag.atLeastOne;
  if (flag.deprecated) {
    schema.deprecated = typeof flag.deprecated === 'object' ? flag.deprecated : true;
  }
}

function buildFlagSchema(flag: Command.Flag.Cached): FlagSchema {
  const schema: FlagSchema = { type: flag.type };
  if (flag.summary) schema.summary = flag.summary;
  if ('char' in flag && flag.char) schema.char = flag.char;
  if (flag.required) schema.required = true;
  if ('multiple' in flag && flag.multiple) schema.multiple = true;
  if ('helpValue' in flag && flag.helpValue) schema.helpValue = flag.helpValue;
  if ('options' in flag && flag.options?.length) schema.options = flag.options;
  if ('delimiter' in flag && flag.delimiter) schema.delimiter = flag.delimiter;
  addRelationships(schema, flag);
  return schema;
}

function buildArgSchema(arg: Command.Arg.Cached): ArgSchema {
  const schema: ArgSchema = {};
  if (arg.description) schema.summary = arg.description;
  if (arg.required) schema.required = true;
  if (arg.options?.length) schema.options = arg.options;
  if (arg.multiple) schema.multiple = true;
  return schema;
}

function hasFlag(cmd: Command.Loadable, flagName: string): boolean {
  return flagName in cmd.flags;
}

function hasRequiredFlag(cmd: Command.Loadable, flagName: string): boolean {
  const flag = cmd.flags[flagName];
  return flag ? Boolean(flag.required) : false;
}

function getErrorCodes(cmd: Command.Loadable): Array<{ name: string; description: string }> | undefined {
  const errorCodes = (cmd as Record<string, unknown>)['errorCodes'];
  if (!errorCodes || typeof errorCodes !== 'object') return undefined;
  const section = errorCodes as { body?: unknown[] };
  if (!Array.isArray(section.body)) return undefined;
  return section.body.filter(
    (entry): entry is { name: string; description: string } =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Record<string, unknown>)['name'] === 'string' &&
      typeof (entry as Record<string, unknown>)['description'] === 'string'
  );
}

export default class Schema extends SfCommand<SchemaResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly enableJsonFlag = true;

  public static readonly flags = {
    command: Flags.string({
      summary: messages.getMessage('flags.command.summary'),
    }),
  };

  // eslint-disable-next-line class-methods-use-this
  public jsonEnabled(): boolean {
    return true;
  }

  public async run(): Promise<SchemaResult> {
    const { flags } = await this.parse(Schema);

    if (flags.command) {
      return this.getCommandSchema(flags.command);
    }

    return this.getCommandIndex();
  }

  private getCommandSchema(commandInput: string): CommandSchema {
    const commandId = commandInput.replace(/ /g, ':');
    const found = this.config.findCommand(commandId);
    if (!found) {
      throw new SfError(messages.getMessage('error.commandNotFound', [commandInput]), 'CommandNotFoundError');
    }

    const flagSchemas: Record<string, FlagSchema> = {};
    for (const [flagName, flag] of Object.entries(found.flags)) {
      if (!flag.hidden && !BASE_FLAGS.has(flagName)) {
        flagSchemas[flagName] = buildFlagSchema(flag);
      }
    }

    const argSchemas: Record<string, ArgSchema> = {};
    for (const [argName, arg] of Object.entries(found.args)) {
      if (!arg.hidden) {
        argSchemas[argName] = buildArgSchema(arg);
      }
    }

    const result: CommandSchema = {
      command: found.id,
      summary: found.summary,
      requiresProject: Boolean(found.requiresProject),
      requiresOrg: hasRequiredFlag(found, 'target-org'),
      acceptsOrg: hasFlag(found, 'target-org'),
      requiresDevHub: hasRequiredFlag(found, 'target-dev-hub'),
      acceptsDevHub: hasFlag(found, 'target-dev-hub'),
      enableJsonFlag: Boolean(found.enableJsonFlag),
      flags: flagSchemas,
      args: argSchemas,
    };

    const codes = getErrorCodes(found);
    if (codes?.length) {
      result.errorCodes = codes;
    }

    return result;
  }

  private getCommandIndex(): CommandIndex {
    const commands = this.config.commands
      .filter((c) => !c.hidden)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => ({
        id: c.id,
        summary: c.summary,
        requiresProject: Boolean(c.requiresProject),
        requiresOrg: hasRequiredFlag(c, 'target-org'),
        acceptsOrg: hasFlag(c, 'target-org'),
        requiresDevHub: hasRequiredFlag(c, 'target-dev-hub'),
        acceptsDevHub: hasFlag(c, 'target-dev-hub'),
      }));

    return { commands };
  }
}
