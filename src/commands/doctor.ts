/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, Lifecycle, SfError } from '@salesforce/core';
import * as open from 'open';
import { Doctor as SFDoctor, SfDoctor, SfDoctorDiagnosis } from '../doctor';
import { DiagnosticStatus } from '../diagnostics';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-info', 'doctor');

export default class Doctor extends SfdxCommand {
  public static description = messages.getMessage('commandDescription');
  public static examples = messages.getMessage('examples').split(os.EOL);

  // Hide for now
  public static hidden = true;

  protected static flagsConfig = {
    command: flags.string({
      char: 'c',
      description: messages.getMessage('flags.command'),
    }),
    plugin: flags.string({
      char: 'p',
      description: messages.getMessage('flags.plugin'),
    }),
    outputdir: flags.directory({
      char: 'o',
      description: messages.getMessage('flags.outputdir'),
    }),
    createissue: flags.boolean({
      char: 'i',
      description: messages.getMessage('flags.createissue'),
      default: false,
    }),
  };

  // Array of promises that are various doctor tasks to perform
  // such as running a command and running diagnostics.
  private tasks: Array<Promise<void>> = [];
  private doctor: SfDoctor;
  private outputDir: string;
  private filesWrittenMsgs: string[] = [];

  /**
   * Only made into its own method for unit testing purposes
   *
   * @param url: url string to open
   */
  public static async openUrl(url: string): Promise<void> {
    await open(url);
  }

  public async run(): Promise<SfDoctorDiagnosis> {
    this.doctor = SFDoctor.getInstance();
    const lifecycle = Lifecycle.getInstance();

    const pluginFlag = this.flags.plugin as string;
    const commandFlag = this.flags.command as string;
    const outputdirFlag = this.flags.outputdir as string;
    const createissueFlag = this.flags.createissue as boolean;
    this.outputDir = path.resolve(outputdirFlag ?? process.cwd());

    if (createissueFlag) {
      this.ux.log('===== TO HERE =====');
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    lifecycle.on<DiagnosticStatus>('Doctor:diagnostic', async (data) => {
      this.ux.log(`${data.status} - ${data.testName}`);
      this.doctor.addDiagnosticStatus(data);
    });

    if (commandFlag) {
      this.setupCommandExecution(commandFlag);
    }

    if (pluginFlag) {
      // verify the plugin flag matches an installed plugin
      if (!this.config.plugins.some((p) => p.name === pluginFlag)) {
        throw new SfError(messages.getMessage('pluginNotInstalledError', [pluginFlag]), 'UnknownPluginError');
      }

      this.ux.styledHeader(`Running diagnostics for plugin: ${pluginFlag}`);
      const listeners = lifecycle.getListeners(`sf-doctor-${pluginFlag}`);
      if (listeners.length) {
        // run the diagnostics for a specific plugin
        this.tasks.push(lifecycle.emit(`sf-doctor-${pluginFlag}`, this.doctor));
      } else {
        this.ux.log("Plugin doesn't have diagnostic tests to run.");
      }
    } else {
      this.ux.styledHeader('Running all diagnostics');
      // run all diagnostics
      this.tasks.push(lifecycle.emit('sf-doctor', this.doctor));

      /* eslint-disable @typescript-eslint/ban-ts-comment,@typescript-eslint/no-unsafe-assignment */
      // @ts-ignore Seems like a TypeScript bug. Compiler thinks doctor.diagnose() returns `void`.
      this.tasks = [...this.tasks, ...this.doctor.diagnose()];
      /* eslint-enable @typescript-eslint/ban-ts-comment,@typescript-eslint/no-unsafe-assignment */
    }

    await Promise.all(this.tasks);

    const diagnosis = this.doctor.getDiagnosis();
    const diagnosisLocation = this.doctor.writeFileSync(
      path.join(this.outputDir, 'diagnosis.json'),
      JSON.stringify(diagnosis, null, 2)
    );
    this.filesWrittenMsgs.push(`Wrote doctor diagnosis to: ${diagnosisLocation}`);

    this.ux.log();
    this.filesWrittenMsgs.forEach((msg) => this.ux.log(msg));

    this.ux.log();
    this.ux.styledHeader('Suggestions');
    diagnosis.suggestions.forEach((s) => this.ux.log(`  * ${s}`));

    if (createissueFlag) {
      this.ux.log();
      this.ux.log(diagnosis.cliConfig.userAgent);
      this.ux.log(diagnosis.versionDetail.pluginVersions.join(os.EOL));
      this.ux.log('SFDX ENV. VARS.');
      this.ux.log(diagnosis.sfdxEnvVars.join(os.EOL));
      this.ux.log('SF ENV. VARS.');
      this.ux.log(diagnosis.sfEnvVars.join(os.EOL));
      this.ux.log(`Windows: ${diagnosis.cliConfig.windows}`);
      this.ux.log(`Shell: ${diagnosis.cliConfig.shell}`);
      this.ux.log(`Channel: ${diagnosis.cliConfig.channel}`);
      this.ux.log(diagnosis.cliConfig.userAgent);
      this.ux.log('===== COPY FROM HERE ABOVE =====');
      this.ux.log();
      this.ux.log("Hi, let's create a new github issue for you!");

      const title = await this.ux.prompt('Please enter a title for the issue');
      const url = encodeURI(
        `https://github.com/forcedotcom/cli/issues/new?title=${title}&template=bug_report.md&labels=doctor,investigating,${this.config.bin}`
      );
      this.ux.log("now please copy the above terminal output and place in the 'System Information' section in github");
      await this.ux.prompt("press 'Enter' to continue", { required: false });
      await Doctor.openUrl(url);
    }

    return diagnosis;
  }

  // Takes the command flag and:
  //   1. ensures it begins with `${config.bin}`; typically "sfdx" or "sf"
  //   2. ensures the `--dev-debug` flag is set
  private parseCommand(command: string): string {
    let fullCmd = command.trim();

    if (!fullCmd.startsWith(`${this.config.bin} `)) {
      fullCmd = `${this.config.bin} ${fullCmd}`;
    }

    if (!command.includes('--dev-debug')) {
      fullCmd += ' --dev-debug';
    }

    return fullCmd;
  }

  // Adds a promise to execute the provided command and all
  // parameters in debug mode, writing stdout and stderr to files
  // in the current or specified directory.
  private setupCommandExecution(command: string): void {
    const cmdString = this.parseCommand(command);
    this.ux.styledHeader('Running command with debugging');
    this.ux.log(`${cmdString}\n`);
    this.doctor.addCommandName(cmdString);

    const execPromise = new Promise<void>((resolve) => {
      const execOptions = {
        env: Object.assign({}, process.env),
      };

      exec(cmdString, execOptions, (error, stdout, stderr) => {
        const code = error?.code || 0;
        const stdoutWithCode = `Command exit code: ${code}\n\n${stdout}`;
        const stdoutLogLocation = this.doctor.writeFileSync(
          path.join(this.outputDir, 'command-stdout.log'),
          stdoutWithCode
        );
        const debugLogLocation = this.doctor.writeFileSync(path.join(this.outputDir, 'command-debug.log'), stderr);
        this.filesWrittenMsgs.push(`Wrote command stdout log to: ${stdoutLogLocation}`);
        this.filesWrittenMsgs.push(`Wrote command debug log to: ${debugLogLocation}`);
        resolve();
      });
    });
    this.tasks.push(execPromise);
  }
}
