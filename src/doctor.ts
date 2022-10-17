/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'fs';
import * as path from 'path';
import { Messages, SfError } from '@salesforce/core';
import { Env, omit } from '@salesforce/kit';
import { AnyJson, KeyValue } from '@salesforce/ts-types';
import { Config } from '@oclif/core';
import { VersionDetail } from '@oclif/plugin-version';
import { Diagnostics, DiagnosticStatus } from './diagnostics';

export interface SfDoctor {
  addCommandName(commandName: string): void;
  addSuggestion(suggestion: string): void;
  addDiagnosticStatus(status: DiagnosticStatus): void;
  addPluginData(pluginName: string, data: AnyJson): void;
  diagnose(): Array<Promise<void>>;
  getDiagnosis(): SfDoctorDiagnosis;
  writeFileSync(filePath: string, contents: string): string;
}

type CliConfig = Partial<Config> & { nodeEngine: string };

export interface SfDoctorDiagnosis {
  versionDetail: VersionDetail;
  sfdxEnvVars: Array<KeyValue<string>>;
  sfEnvVars: Array<KeyValue<string>>;
  cliConfig: CliConfig;
  pluginSpecificData: { [pluginName: string]: AnyJson[] };
  diagnosticResults: DiagnosticStatus[];
  suggestions: string[];
  commandName?: string;
  logFilePaths: string[];
}

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-info', 'doctor');

const PINNED_SUGGESTIONS = [
  messages.getMessage('pinnedSuggestions.checkGitHubIssues'),
  messages.getMessage('pinnedSuggestions.checkSfdcStatus'),
];

export class Doctor implements SfDoctor {
  // singleton instance
  private static instance: SfDoctor;

  public readonly id: number;

  // Contains all gathered data and results of diagnostics.
  private diagnosis: SfDoctorDiagnosis;

  private constructor(private readonly config: Config, versionDetail: VersionDetail) {
    this.id = Date.now();
    const sfdxEnvVars = new Env().entries().filter((e) => e[0].startsWith('SFDX_'));
    const sfEnvVars = new Env().entries().filter((e) => e[0].startsWith('SF_'));
    const cliConfig = omit(config, ['plugins', 'pjson', 'userPJSON', 'options']) as CliConfig;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    cliConfig.nodeEngine = config.pjson.engines.node as string;

    this.diagnosis = {
      versionDetail,
      sfdxEnvVars,
      sfEnvVars,
      cliConfig,
      pluginSpecificData: {},
      diagnosticResults: [],
      suggestions: [...PINNED_SUGGESTIONS],
      logFilePaths: [],
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
   * Initializes a new instance of SfDoctor with CLI config data.
   *
   * @param config The oclif config for the CLI
   * @param versionDetail The result of running a verbose version command
   * @returns An instance of SfDoctor
   */
  public static init(config: Config, versionDetail: VersionDetail): SfDoctor {
    if (Doctor.instance) {
      throw new SfError(messages.getMessage('doctorAlreadyInitializedError'), 'SfDoctorInitError');
    }

    Doctor.instance = new this(config, versionDetail);
    return Doctor.instance;
  }

  /**
   * Use the gathered data to discover potential problems by running all diagnostics.
   *
   * @returns An array of diagnostic promises.
   */
  public diagnose(): Array<Promise<void>> {
    return new Diagnostics(this, this.config).run();
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
    const dir = path.dirname(filePath);
    const fileName = `${this.id}-${path.basename(filePath)}`;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const fullPath = path.join(dir, fileName);
    this.diagnosis.logFilePaths.push(fullPath);
    fs.writeFileSync(fullPath, contents);
    return fullPath;
  }
}
