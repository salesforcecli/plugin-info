/*
 * Copyright 2025, Salesforce, Inc.
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

import childProcess from 'node:child_process';
import { got } from 'got';
import { Interfaces } from '@oclif/core';
import { Lifecycle, Messages } from '@salesforce/core';
import { Connection } from '@jsforce/jsforce-node';
import { SfDoctor, SfDoctorDiagnosis } from './doctor.js';

export type DiagnosticStatus = {
  testName: string;
  status: 'pass' | 'fail' | 'warn' | 'unknown';
};

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-info', 'diagnostics');

/**
 * Diagnostics are all the tests that ensure a known, clean CLI configuration
 * and a way to run them asynchronously. Typically this is used only by the
 * Doctor class.
 *
 * Create a new diagnostic test by adding a method to the `Diagnostics` class,
 * appending "Check" to the name. Emit a "Doctor:diagnostic" event with a
 * `DiagnosticStatus` payload so the CLI can report on the diagnostic result.
 */
export class Diagnostics {
  private diagnosis: SfDoctorDiagnosis;

  public constructor(private readonly doctor: SfDoctor, private config: Interfaces.Config) {
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
  // NOTE: Diagnostic function names must end with "Check"
  //       or they will not be run with all diagnostics.
  //
  // **********************************************************

  /**
   * Checks to see if the running version of the CLI is the latest.
   */
  public async outdatedCliVersionCheck(): Promise<void> {
    const cliName = this.config.name;
    const cliVersion = this.config.version;

    return new Promise<void>((resolve) => {
      const testName = 'using latest or latest-rc CLI version';
      let status: DiagnosticStatus['status'] = 'unknown';

      childProcess.exec(`npm view ${cliName} dist-tags.latest`, {}, (error, stdout, stderr) => {
        const code = error?.code ?? 0;
        if (code === 0) {
          const latest = stdout.trim();
          if (cliVersion < latest) {
            status = 'fail';
            this.doctor.addSuggestion(messages.getMessage('updateCliVersion', [cliVersion, latest]));
          } else {
            status = 'pass';
          }
        } else {
          this.doctor.addSuggestion(messages.getMessage('latestCliVersionError', [stderr]));
        }
        void Lifecycle.getInstance()
          .emit('Doctor:diagnostic', { testName, status })
          .then(() => resolve());
      });
    });
  }

  /**
   * Checks to see if the cli is outdated and deprecated (sfdx7 sf1)
   */
  public async deprecatedCliCheck(): Promise<void> {
    const cliName = this.config.name;
    const cliVersion = this.config.version;

    if (cliName === 'sfdx-cli' && cliVersion.startsWith('7.')) {
      await Lifecycle.getInstance().emit('Doctor:diagnostic', { testName: 'using sfdx-cli version 7', status: 'fail' });
      this.doctor.addSuggestion(messages.getMessage('uninstallSuggestion', [cliName, cliVersion]));
    }

    if (cliName === '@salesforce/cli' && cliVersion.startsWith('1.')) {
      await Lifecycle.getInstance().emit('Doctor:diagnostic', {
        testName: 'using @salesforce/cli version 1',
        status: 'fail',
      });
      this.doctor.addSuggestion(messages.getMessage('uninstallSuggestion', [cliName, cliVersion]));
    }
  }

  /**
   * Checks if the salesforcedx plugin is installed and suggests
   * to uninstall it if there.
   */
  public async salesforceDxPluginCheck(): Promise<void> {
    let status: DiagnosticStatus['status'] = 'pass';

    const plugins = Object.keys(this.config.versionDetails.pluginVersions ?? {});
    if (plugins?.some((p) => p === 'salesforcedx')) {
      status = 'fail';
      const bin = this.diagnosis.cliConfig.bin;
      this.doctor.addSuggestion(messages.getMessage('salesforceDxPluginDetected', [bin]));
    }
    await Lifecycle.getInstance().emit('Doctor:diagnostic', {
      testName: status === 'pass' ? 'salesforcedx plugin isn’t installed' : 'salesforcedx plugin is installed',
      status,
    });
  }

  public async networkCheck(): Promise<void> {
    await Promise.all(
      [
        // salesforce endpoints
        'https://test.salesforce.com',
        'https://appexchange.salesforce.com/services/data',
      ].map(async (url) => {
        try {
          const conn = new Connection();
          await conn.request(url);
          await Lifecycle.getInstance().emit('Doctor:diagnostic', { testName: `can access: ${url}`, status: 'pass' });
        } catch (e) {
          await Lifecycle.getInstance().emit('Doctor:diagnostic', { testName: `can't access: ${url}`, status: 'fail' });
          this.doctor.addSuggestion(
            `Cannot reach ${url} - potential network configuration error, check proxies, firewalls, environment variables`
          );
        }
      })
    );
    // our S3 bucket, use the buildmanifest to avoid downloading the entire CLI
    const manifestUrl =
      'https://developer.salesforce.com/media/salesforce-cli/sf/channels/stable/sf-win32-x64-buildmanifest';
    try {
      await got.get(manifestUrl);
      await Lifecycle.getInstance().emit('Doctor:diagnostic', {
        testName: `can access: ${manifestUrl}`,
        status: 'pass',
      });
    } catch (e) {
      await Lifecycle.getInstance().emit('Doctor:diagnostic', {
        testName: `can't access: ${manifestUrl}`,
        status: 'fail',
      });
      this.doctor.addSuggestion(
        `Cannot reach ${manifestUrl} - potential network configuration error, check proxies, firewalls, environment variables`
      );
    }
  }

  /**
   * Checks and warns if any plugins are linked.
   */
  public async linkedPluginCheck(): Promise<void> {
    let status: DiagnosticStatus['status'] = 'pass';

    const plugins = this.config.getPluginsList();
    const linkedPlugins = plugins.filter((p) => p.type === 'link');
    linkedPlugins.forEach((lp) => {
      status = 'fail';
      this.doctor.addSuggestion(messages.getMessage('linkedPluginWarning', [lp.name]));
    });
    await Lifecycle.getInstance().emit('Doctor:diagnostic', {
      testName: status === 'pass' ? "you don't have any linked plugins" : 'you have at least one linked plugin',
      status,
    });
  }

  /**
   * Checks and warns if proxy env vars conflict.
   */
  public async proxyEnvVarsCheck(): Promise<void> {
    const httpProxyEnvVars: string[] = [];
    const httpsProxyEnvVars: string[] = [];
    const noProxyEnvVars: string[] = [];
    this.diagnosis.proxyEnvVars.forEach((pev) => {
      if (['http_proxy', 'HTTP_PROXY'].includes(pev[0])) {
        httpProxyEnvVars.push(pev[1]);
      }
      if (['https_proxy', 'HTTPS_PROXY'].includes(pev[0])) {
        httpsProxyEnvVars.push(pev[1]);
      }
      if (['no_proxy', 'NO_PROXY'].includes(pev[0])) {
        noProxyEnvVars.push(pev[1]);
      }
    });

    const getStatus = (envVars: string[]): DiagnosticStatus['status'] =>
      (envVars[0] && envVars.length === 1) || envVars[0] === envVars[1] ? 'pass' : 'fail';

    const httpProxyEnvVarStatus = getStatus(httpProxyEnvVars);
    const httpsProxyEnvVarStatus = getStatus(httpsProxyEnvVars);
    const noProxyEnvVarStatus = getStatus(noProxyEnvVars);

    if (httpProxyEnvVars.length) {
      await Lifecycle.getInstance().emit('Doctor:diagnostic', {
        testName: 'http_proxy and HTTP_PROXY environment variables match',
        status: httpProxyEnvVarStatus,
      });
    }
    if (httpsProxyEnvVars.length) {
      await Lifecycle.getInstance().emit('Doctor:diagnostic', {
        testName: 'https_proxy and HTTPS_PROXY environment variables match',
        status: httpsProxyEnvVarStatus,
      });
    }
    if (noProxyEnvVars.length) {
      await Lifecycle.getInstance().emit('Doctor:diagnostic', {
        testName: 'no_proxy and NO_PROXY environment variables match',
        status: noProxyEnvVarStatus,
      });
      await Lifecycle.getInstance().emit('Doctor:diagnostic', {
        testName: 'no_proxy and/or NO_PROXY environment variables set',
        status: 'warn',
      });
      this.doctor.addSuggestion(messages.getMessage('noProxyEnvVarSet'));
    }

    if (httpProxyEnvVarStatus === 'fail') {
      this.doctor.addSuggestion(messages.getMessage('matchProxyEnvVarSuggestion', ['http_proxy', 'HTTP_PROXY']));
    }
    if (httpsProxyEnvVarStatus === 'fail') {
      this.doctor.addSuggestion(messages.getMessage('matchProxyEnvVarSuggestion', ['https_proxy', 'HTTPS_PROXY']));
    }
    if (noProxyEnvVarStatus === 'fail') {
      this.doctor.addSuggestion(messages.getMessage('matchProxyEnvVarSuggestion', ['no_proxy', 'NO_PROXY']));
    }
  }
}
