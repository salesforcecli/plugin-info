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
import { Doctor as SFDoctor, SfDoctorDiagnosis } from '../doctor';

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

  public async run(): Promise<SfDoctorDiagnosis> {
    let promises: Array<Promise<void>> = [];
    const doctor = SFDoctor.getInstance();
    const lifecycle = Lifecycle.getInstance();

    const plugin = this.flags.plugin as string;
    const command = this.flags.command as string;
    const newissue = this.flags.newissue as boolean;

    if (command) {
      const cmdString = this.parseCommand(command);
      this.ux.log(`Running Command: ${cmdString}\n`);
      const cmdName = cmdString.split(' ')[1];
      doctor.addCommandName(cmdName);

      const execPromise = new Promise<void>((resolve) => {
        const execOptions = {
          env: Object.assign({}, process.env),
        };

        exec(cmdString, execOptions, (error, stdout, stderr) => {
          const code = error?.code || 0;
          const stdoutWithCode = `Command exit code: ${code}\n\n${stdout}`;
          const stdoutFileName = `${cmdName}-stdout.log`;
          const stderrFileName = `${cmdName}-stderr.log`;
          const stdoutLogLocation = doctor.writeFileSync(stdoutFileName, stdoutWithCode);
          const debugLogLocation = doctor.writeFileSync(stderrFileName, stderr);
          this.ux.log(`Wrote command stdout log to: ${stdoutLogLocation}`);
          this.ux.log(`Wrote command debug log to: ${debugLogLocation}`);
          resolve();
        });
      });
      promises.push(execPromise);
    }

    if (plugin) {
      // verify the plugin flag matches an installed plugin
      if (!this.config.plugins.some((p) => p.name === plugin)) {
        const errMsg = `Specified plugin [${plugin}] is not installed. Please install it or choose another plugin.`;
        throw Error(errMsg);
      }

      // run the diagnostics for a specific plugin
      this.ux.log(`Running diagnostics for plugin: ${plugin}`);
      promises.push(lifecycle.emit(`sf-doctor-${plugin}`, doctor));
    } else {
      this.ux.log('Running diagnostics for all plugins and the core CLI');
      // run all diagnostics
      promises.push(lifecycle.emit('sf-doctor', doctor));

      /* eslint-disable @typescript-eslint/ban-ts-comment,@typescript-eslint/no-unsafe-assignment */
      // @ts-ignore Seems like a TypeScript bug. Compiler thinks doctor.diagnose() returns `void`.
      promises = [...promises, ...doctor.diagnose()];
      /* eslint-enable @typescript-eslint/ban-ts-comment,@typescript-eslint/no-unsafe-assignment */
    }

    await Promise.all(promises);

    const diagnosis = doctor.getDiagnosis();
    const diagnosisLocation = doctor.writeFileSync('diagnosis.json', JSON.stringify(diagnosis, null, 2));
    this.ux.log(`Wrote doctor diagnosis to: ${diagnosisLocation}`);

    if (newissue) {
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
}
