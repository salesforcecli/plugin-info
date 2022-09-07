/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as os from 'os';
import { exec } from 'child_process';
import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, Lifecycle } from '@salesforce/core';
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
    newissue: flags.boolean({
      char: 'i',
      description: messages.getMessage('flags.newissue'),
    }),
    plugin: flags.string({
      char: 'p',
      description: messages.getMessage('flags.plugin'),
    }),
  };

  // Array of promises that are various doctor tasks to perform
  // such as running a command and running diagnostics.
  private tasks: Array<Promise<void>> = [];

  private doctor: SfDoctor;

  private filesWrittenMsgs: string[] = [];

  public async run(): Promise<SfDoctorDiagnosis> {
    SFDoctor.init(this.config, {
      cliVersion: 'sfdx-cli/7.165.1',
      pluginVersions: ['foo', 'bar (link)', 'salesforcedx'],
      nodeVersion: 'node-v16.17.0',
      architecture: 'darwin-x64'
    });
    this.doctor = SFDoctor.getInstance();
    const lifecycle = Lifecycle.getInstance();

    const plugin = this.flags.plugin as string;
    const command = this.flags.command as string;
    const newissue = this.flags.newissue as boolean;

    // eslint-disable-next-line @typescript-eslint/require-await
    lifecycle.on<DiagnosticStatus>('Doctor:diagnostic', async (data) => {
      this.ux.log(`${data.status} - ${data.testName}`);
    });

    if (command) {
      this.setupCommandExecution(command);
    }

    if (plugin) {
      // verify the plugin flag matches an installed plugin
      if (!this.config.plugins.some((p) => p.name === plugin)) {
        const errMsg = `Specified plugin [${plugin}] is not installed. Please install it or choose another plugin.`;
        throw Error(errMsg);
      }

      // run the diagnostics for a specific plugin
      this.ux.styledHeader(`Running diagnostics for plugin: ${plugin}`);
      this.tasks.push(lifecycle.emit(`sf-doctor-${plugin}`, this.doctor));
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
    const diagnosisLocation = this.doctor.writeFileSync('diagnosis.json', JSON.stringify(diagnosis, null, 2));
    this.filesWrittenMsgs.push(`Wrote doctor diagnosis to: ${diagnosisLocation}`);

    this.ux.log();
    this.filesWrittenMsgs.forEach((msg) => this.ux.log(msg));

    this.ux.log();
    this.ux.styledHeader('Suggestions');
    diagnosis.suggestions.forEach(s => this.ux.log(`  * ${s}`));

    if (newissue) {
      this.createNewIssue();
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
  // in the doctor directory.
  private setupCommandExecution(command: string): void {
    const cmdString = this.parseCommand(command);
    this.ux.log(`Running Command: "${cmdString}"\n`);
    const cmdName = cmdString.split(' ')[1];
    this.doctor.addCommandName(cmdName);

    const execPromise = new Promise<void>((resolve) => {
      const execOptions = {
        env: Object.assign({}, process.env),
      };

      exec(cmdString, execOptions, (error, stdout, stderr) => {
        const code = error?.code || 0;
        const stdoutWithCode = `Command exit code: ${code}\n\n${stdout}`;
        const stdoutFileName = `${cmdName}-stdout.log`;
        const stderrFileName = `${cmdName}-stderr.log`;
        const stdoutLogLocation = this.doctor.writeFileSync(stdoutFileName, stdoutWithCode);
        const debugLogLocation = this.doctor.writeFileSync(stderrFileName, stderr);
        this.filesWrittenMsgs.push(`Wrote command stdout log to: ${stdoutLogLocation}`);
        this.filesWrittenMsgs.push(`Wrote command debug log to: ${debugLogLocation}`);
        resolve();
      });
    });
    this.tasks.push(execPromise);
  }

  private createNewIssue(): void {
    // create a new issue via prompts (Inquirer)

    // See https://docs.github.com/en/enterprise-server@3.1/issues/tracking-your-work-with-issues/creating-an-issue#creating-an-issue-from-a-url-query
    // Example: https://github.com/forcedotcom/cli/issues/new?title=PLEASE+UPDATE&body=Autofill+info+collected+by+doctor...&labels=doctor

    this.ux.warn('New GitHub issue creation is not yet implemented. Coming soon!');
    // this.ux.log('\nCreating a new GitHub issue for the CLI...\n');
    // const isItNew = await this.ux.prompt(
    //   'Have you first checked the list of GitHub issues to ensure it has not already been posted? (y/n)'
    // );

    // if (isItNew.toLowerCase() === 'y') {
    //   const title = await this.ux.prompt('What is the subject of the issue?');
    //   this.ux.log('Encoded title=', encodeURI(title));
    //   this.ux.log("I'll create an issue for you with that title and attach the doctor diagnostics.");
    // } else {
    //   this.ux.log('Please check https://github.com/forcedotcom/cli/issues first');
    // }
  }
}
