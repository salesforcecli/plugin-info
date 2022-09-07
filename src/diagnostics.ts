/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { exec } from 'child_process';
import { Config } from '@oclif/core';
import { Lifecycle, Messages } from '@salesforce/core';
import { SfDoctor, SfDoctorDiagnosis } from './doctor';

// const SUPPORTED_SHELLS = [
//   'bash',
//   'zsh',
//   'powershell'
//   'cmd.exe'
// ];

export interface DiagnosticStatus {
  testName: string;
  status: 'pass' | 'fail' | 'warn' | 'unknown';
}

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-info', 'diagnostics');

/**
 * Diagnostics are all the tests that ensure a known, clean CLI configuration
 * and a way to run them asynchronously. Typically this is used only by the
 * Doctor class.
 */
export class Diagnostics {
  private diagnosis: SfDoctorDiagnosis;

  public constructor(private readonly doctor: SfDoctor, private config: Config) {
    this.diagnosis = doctor.getDiagnosis();
  }

  /**
   * Run all diagnostics using the data gathered by the doctor and add
   * suggestions to the diagnosis.
   */
  public run(): Array<Promise<void>> {
    const keys = Reflect.ownKeys(Diagnostics.prototype) as Array<Exclude<keyof Diagnostics, 'run'>>;
    return keys.filter((key) => key.endsWith('Check')).map((diagnostic) => this[diagnostic]());
  }

  // **********************************************************
  //                 D I A G N O S T I C S
  //
  // NOTE: All diagnostic function names must end with "Check"
  //       or they will not be run with all diagnostics.
  //
  // **********************************************************

  /**
   * Checks to see if the running version of the CLI is the latest.
   */
  public async outdatedCliVersionCheck(): Promise<void> {
    const cliVersionArray = this.diagnosis.versionDetail.cliVersion.split('/');
    const cliName = cliVersionArray[0];
    const cliVersion = cliVersionArray[1];

    return new Promise<void>((resolve) => {
      const testName = 'using latest CLI version';
      let status: DiagnosticStatus['status'] = 'unknown';

      exec(`npm view ${cliName} --json`, {}, async (error, stdout, stderr) => {
        const code = error?.code ?? 0;
        if (code === 0) {
          const latestVersion = JSON.parse(stdout)['dist-tags'].latest as string;
          if (cliVersion < latestVersion) {
            status = 'fail';
            this.doctor.addSuggestion(messages.getMessage('updateCliVersion', [cliVersion, latestVersion]));
          } else {
            status = 'pass';
          }
        } else {
          this.doctor.addSuggestion(messages.getMessage('latestCliVersionError', [stderr]));
        }
        await Lifecycle.getInstance().emit('Doctor:diagnostic', { testName, status });
        resolve();
      });
    });
  }

  /**
   * Checks if the salesforcedx plugin is installed and suggests
   * to uninstall it if there.
   */
  public async salesforceDxPluginCheck(): Promise<void> {
    const testName = 'salesforcedx plugin not installed';
    let status: DiagnosticStatus['status'] = 'pass';

    const plugins = this.diagnosis.versionDetail.pluginVersions;
    if (plugins?.some((p) => p.split(' ')[0] === 'salesforcedx')) {
      status = 'fail';
      const bin = this.diagnosis.cliConfig.bin;
      this.doctor.addSuggestion(messages.getMessage('salesforceDxPluginDetected', [bin]));
    }
    await Lifecycle.getInstance().emit('Doctor:diagnostic', { testName, status });
  }

  /**
   * Checks and warns if any plugins are linked.
   */
  public async linkedPluginCheck(): Promise<void> {
    const testName = 'no linked plugins';
    let status: DiagnosticStatus['status'] = 'pass';

    const plugins = this.config.plugins;
    const linkedPlugins = plugins.filter((p) => p.name.includes('(link)'));
    linkedPlugins.forEach((lp) => {
      status = 'fail';
      this.doctor.addSuggestion(messages.getMessage('linkedPluginWarning', [lp.name]));
    });
    await Lifecycle.getInstance().emit('Doctor:diagnostic', { testName, status });
  }
}
