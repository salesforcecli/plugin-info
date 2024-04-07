/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import fs from 'node:fs';
import { join, dirname, basename } from 'node:path';

import { Messages, SfError } from '@salesforce/core';
import { Env, omit } from '@salesforce/kit';
import type { AnyJson, KeyValue } from '@salesforce/ts-types';
import { Interfaces } from '@oclif/core';
import { PluginVersionDetail } from '@oclif/core/lib/interfaces';
import { Diagnostics, DiagnosticStatus } from './diagnostics.js';

export type SfDoctor = {
  addCommandName(commandName: string): void;
  addDiagnosticStatus(status: DiagnosticStatus): void;
  addPluginData(pluginName: string, data: AnyJson): void;
  addSuggestion(suggestion: string): void;
  closeStderr(): void;
  closeStdout(): void;
  createStderrWriteStream(fullPath: string): void;
  createStdoutWriteStream(fullPath: string): void;
  diagnose(): Array<Promise<void>>;
  getDiagnosis(): SfDoctorDiagnosis;
  getDoctoredFilePath(filePath: string): string;
  setExitCode(code: string | number): void;
  writeFileSync(filePath: string, contents: string): string;
  writeStderr(contents: string): Promise<boolean>;
  writeStdout(contents: string): Promise<boolean>;
}

type CliConfig = Partial<Interfaces.Config> & { nodeEngine: string };

export type SfDoctorDiagnosis = {
  versionDetail: Omit<Interfaces.VersionDetails, 'pluginVersions'> & { pluginVersions: string[] };
  sfdxEnvVars: Array<KeyValue<string>>;
  sfEnvVars: Array<KeyValue<string>>;
  cliConfig: CliConfig;
  pluginSpecificData: { [pluginName: string]: AnyJson[] };
  diagnosticResults: DiagnosticStatus[];
  suggestions: string[];
  commandName?: string;
  commandExitCode?: string | number;
  logFilePaths: string[];
}

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-info', 'doctor');

const PINNED_SUGGESTIONS = [
  messages.getMessage('pinnedSuggestions.checkGitHubIssues'),
  messages.getMessage('pinnedSuggestions.checkSfdcStatus'),
];

// private config from the CLI
// eslint-disable-next-line no-underscore-dangle
let __cliConfig: Interfaces.Config;

export class Doctor implements SfDoctor {
  // singleton instance
  private static instance: SfDoctor;

  public readonly id: number;

  // Contains all gathered data and results of diagnostics.
  private diagnosis: SfDoctorDiagnosis;
  private stdoutWriteStream: fs.WriteStream | undefined;
  private stderrWriteStream: fs.WriteStream | undefined;

  private constructor(config: Interfaces.Config) {
    this.id = Date.now();
    __cliConfig = config;
    const sfdxEnvVars = new Env().entries().filter((e) => e[0].startsWith('SFDX_'));
    const sfEnvVars = new Env().entries().filter((e) => e[0].startsWith('SF_'));
    const cliConfig = omit(config, [
      'plugins',
      'pjson',
      'userPJSON',
      'options',
      '_commandIDs',
      'rootPlugin',
    ]) as CliConfig;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    cliConfig.nodeEngine = config.pjson.engines.node as string;

    const { pluginVersions, ...versionDetails } = config.versionDetails;

    this.diagnosis = {
      versionDetail: { ...versionDetails, pluginVersions: formatPlugins(config, pluginVersions ?? {}) },
      sfdxEnvVars,
      sfEnvVars,
      cliConfig,
      pluginSpecificData: {},
      diagnosticResults: [],
      suggestions: [...PINNED_SUGGESTIONS],
      logFilePaths: [],
      commandExitCode: 0,
    };
  }

  /**
   * Returns a singleton instance of an SfDoctor.
   */
  public static getInstance(): SfDoctor {
    if (!Doctor.instance) {
      throw new SfError(messages.getMessage('doctorNotInitializedError'), 'SfDoctorInitError');
    }
    return Doctor.instance;
  }
  /**
   * Returns true if Doctor has been initialized.
   */
  public static isDoctorEnabled(): boolean {
    return !!Doctor.instance;
  }

  /**
   * Initializes a new instance of SfDoctor with CLI config data.
   *
   * @param config The oclif config for the CLI
   * @param versionDetail The result of running a verbose version command
   * @returns An instance of SfDoctor
   */
  public static init(config: Interfaces.Config): SfDoctor {
    if (Doctor.instance) {
      return Doctor.instance;
    }

    Doctor.instance = new this(config);
    return Doctor.instance;
  }

  /**
   * Use the gathered data to discover potential problems by running all diagnostics.
   *
   * @returns An array of diagnostic promises.
   */
  public diagnose(): Array<Promise<void>> {
    return new Diagnostics(this, __cliConfig).run();
  }

  /**
   * Add a suggestion in the form of:
   * "Because of <this data point> we recommend to <suggestion>"
   *
   * @param suggestion A suggestion for the CLI user to try based on gathered data
   */
  public addSuggestion(suggestion: string): void {
    this.diagnosis.suggestions.push(suggestion);
  }

  /**
   * Add a diagnostic test status.
   *
   * @param status a diagnostic test status
   */
  public addDiagnosticStatus(status: DiagnosticStatus): void {
    this.diagnosis.diagnosticResults.push(status);
  }

  /**
   * Add diagnostic data that is specific to the passed plugin name.
   *
   * @param pluginName The name in the plugin's package.json
   * @param data Any data to add to the doctor diagnosis that is specific
   * to the plugin and a valid JSON value.
   */
  public addPluginData(pluginName: string, data: AnyJson): void {
    const pluginEntry = this.diagnosis.pluginSpecificData[pluginName];
    if (pluginEntry) {
      pluginEntry.push(data);
    } else {
      this.diagnosis.pluginSpecificData[pluginName] = [data];
    }
  }

  /**
   * Add a command name that the doctor will run to the diagnosis data for
   * use by diagnostics.
   *
   * @param commandName The name of the command that the doctor will run. E.g., "force:org:list"
   */
  public addCommandName(commandName: string): void {
    this.diagnosis.commandName = commandName;
  }

  /**
   * Returns all the data gathered, paths to doctor files, and recommendations.
   */
  public getDiagnosis(): SfDoctorDiagnosis {
    return { ...this.diagnosis };
  }

  /**
   * Write a file with the provided path. The file name will be prepended
   * with this doctor's id.
   *
   * E.g., `name = myContent.json` will write `1658350735579-myContent.json`
   *
   * @param filePath The path of the file to write.
   * @param contents The string contents to write.
   * @return The full path to the file.
   */
  public writeFileSync(filePath: string, contents: string): string {
    const fullPath = this.getDoctoredFilePath(filePath);
    createOutputDir(fullPath);
    this.diagnosis.logFilePaths.push(fullPath);
    fs.writeFileSync(fullPath, contents);
    return fullPath;
  }

  public writeStdout(contents: string): Promise<boolean> {
    if (!this.stdoutWriteStream) {
      throw new SfError(messages.getMessage('doctorNotInitializedError'), 'SfDoctorInitError');
    }
    return writeFile(this.stdoutWriteStream, contents);
  }

  public writeStderr(contents: string): Promise<boolean> {
    if (!this.stderrWriteStream) {
      throw new SfError(messages.getMessage('doctorNotInitializedError'), 'SfDoctorInitError');
    }
    return writeFile(this.stderrWriteStream, contents);
  }

  public createStdoutWriteStream(fullPath: string): void {
    if (!this.stdoutWriteStream) {
      createOutputDir(fullPath);
      this.stdoutWriteStream = fs.createWriteStream(fullPath);
    }
  }

  public createStderrWriteStream(fullPath: string): void {
    if (!this.stderrWriteStream) {
      createOutputDir(fullPath);
      this.stderrWriteStream = fs.createWriteStream(join(fullPath));
    }
  }

  public closeStderr(): void {
    this.stderrWriteStream?.end();
    this.stderrWriteStream?.close();
  }

  public closeStdout(): void {
    this.stdoutWriteStream?.end();
    this.stdoutWriteStream?.close();
  }

  public getDoctoredFilePath(filePath: string): string {
    const dir = dirname(filePath);
    const fileName = `${this.id}-${basename(filePath)}`;
    const fullPath = join(dir, fileName);
    this.diagnosis.logFilePaths.push(fullPath);
    return fullPath;
  }

  public setExitCode(code: string | number): void {
    this.diagnosis.commandExitCode = code;
  }
}

export function formatPlugins(config: Interfaces.Config, plugins: Record<string, PluginVersionDetail>): string[] {
  function getFriendlyName(name: string): string {
    const scope = config?.pjson?.oclif?.scope;
    if (!scope) return name;
    const match = name.match(`@${scope}/plugin-(.+)`);
    if (!match) return name;
    return match[1];
  }
  return Object.entries(plugins)
    .map(([name, plugin]) => ({ name, ...plugin }))
    .sort((a, b) => (a.name > b.name ? 1 : -1))
    .map((plugin) =>
      `${getFriendlyName(plugin.name)} ${plugin.version} (${plugin.type}) ${
        plugin.type === 'link' ? plugin.root : ''
      }`.trim()
    );
}

const createOutputDir = (fullPath: string): void => {
  const dir = dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const writeFile = (stream: fs.WriteStream, contents: string): Promise<boolean> =>
  Promise.resolve(stream.write(contents));
