/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { exec } from 'child_process';
import { IConfig } from '@oclif/config';
import { SfDoctor, SfDoctorDiagnosis } from './doctor';

// @fixme: remove this when we can get better typing of VersionDetail from sfdx-cli
/* eslint-disable */

// const SUPPORTED_SHELLS = [
//   'bash',
//   'zsh',
//   'powershell'
//   'cmd.exe'
// ];

/**
 * Diagnostics are all the tests that ensure a known, clean CLI configuration
 * and a way to run them asynchronously. Typically this is used only by the
 * Doctor class.
 */
export class Diagnostics {
  private diagnosis: SfDoctorDiagnosis;

  public constructor(private readonly doctor: SfDoctor, private config: IConfig) {
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

  public async outdatedCliVersionCheck(): Promise<void> {
    const cliVersionArray = this.diagnosis.versionDetail.cliVersion.split('/');
    const cliName = cliVersionArray[0];
    const cliVersion = cliVersionArray[1];

    return new Promise<void>((resolve) => {
      exec(`npm view ${cliName} --json`, {}, (error, stdout, stderr) => {
        const code = error?.code || 0;
        if (code === 0) {
          const latestVersion = JSON.parse(stdout)['dist-tags'].latest;
          if (cliVersion < latestVersion) {
            this.doctor.addSuggestion(
              `Update your CLI version from ${cliVersion} to the latest version: ${latestVersion}`
            );
          }
        } else {
          this.doctor.addSuggestion('Could not determine latest CLI version');
        }
        resolve();
      });
    });
  }

  public async salesforceDxPluginCheck(): Promise<void> {
    const plugins = this.diagnosis.versionDetail.pluginVersions;
    if (plugins?.some((p) => p.split(' ')[0] === 'salesforcedx')) {
      const bin = this.diagnosis.cliConfig.bin;
      this.doctor.addSuggestion(
        `The salesforcedx plugin is deprecated. Please uninstall by running \`${bin} plugins:uninstall salesforcedx\``
      );
    }
  }

  public async linkedPluginCheck(): Promise<void> {
    const plugins = this.config.plugins;
    const linkedPlugins = plugins.filter((p) => p.name.includes('(link)'));
    linkedPlugins.forEach((lp) => {
      this.doctor.addSuggestion(`Warning: the [${lp.name}] plugin is linked.`);
    });
  }
}
