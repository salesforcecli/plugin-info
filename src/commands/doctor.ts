/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { Flags, loglevel, SfCommand } from '@salesforce/sf-plugins-core';
import { Lifecycle, Messages, SfError } from '@salesforce/core';
import * as open from 'open';
import got from 'got';
import * as ProxyAgent from 'proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';
import { Doctor as SFDoctor, SfDoctor, SfDoctorDiagnosis } from '../doctor';
import { DiagnosticStatus } from '../diagnostics';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-info', 'doctor');

export default class Doctor extends SfCommand<SfDoctorDiagnosis> {
  public static readonly summary = messages.getMessage('commandDescription');
  public static readonly description = messages.getMessage('commandDescription');
  public static readonly examples = messages.getMessage('examples').split(os.EOL);

  public static readonly flags = {
    command: Flags.string({
      char: 'c',
      summary: messages.getMessage('flags.command'),
    }),
    plugin: Flags.string({
      char: 'p',
      summary: messages.getMessage('flags.plugin'),
    }),
    'output-dir': Flags.directory({
      char: 'd',
      summary: messages.getMessage('flags.output-dir.summary'),
      aliases: ['outputdir', 'o'],
    }),
    'create-issue': Flags.boolean({
      char: 'i',
      summary: messages.getMessage('flags.create-issue.summary'),
      default: false,
      aliases: ['createissue'],
    }),
    loglevel,
  };

  // Array of promises that are various doctor tasks to perform
  // such as running a command and running diagnostics.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tasks: Array<Promise<any>> = [];
  private doctor: SfDoctor;
  private outputDir: string;
  private filesWrittenMsgs: string[] = [];

  public async run(): Promise<SfDoctorDiagnosis> {
    const { flags } = await this.parse(Doctor);
    this.doctor = SFDoctor.getInstance();
    const lifecycle = Lifecycle.getInstance();

    const pluginFlag = flags.plugin;
    const commandFlag = flags.command;
    const outputdirFlag = flags['output-dir'];
    const createissueFlag = flags['create-issue'];
    this.outputDir = path.resolve(outputdirFlag ?? process.cwd());

    // eslint-disable-next-line @typescript-eslint/require-await
    lifecycle.on<DiagnosticStatus>('Doctor:diagnostic', async (data) => {
      this.log(`${data.status} - ${data.testName}`);
      this.doctor.addDiagnosticStatus(data);
    });

    if (commandFlag) {
      this.setupCommandExecution(commandFlag);
    }

    if (pluginFlag) {
      // verify the plugin flag matches an installed plugin
      const plugin = this.config.plugins.find((p) => p.name === pluginFlag);
      if (plugin) {
        const eventName = `sf-doctor-${pluginFlag}`;
        const hasDoctorHook = plugin.hooks && Object.keys(plugin.hooks).some((hook) => hook === eventName);
        if (hasDoctorHook) {
          this.styledHeader(`Running diagnostics for plugin: ${pluginFlag}`);
          this.tasks.push(this.config.runHook(eventName, { doctor: this.doctor }));
        } else {
          this.log(`${pluginFlag} doesn't have diagnostic tests to run.`);
        }
      } else {
        throw new SfError(messages.getMessage('pluginNotInstalledError', [pluginFlag]), 'UnknownPluginError');
      }
    } else {
      this.styledHeader('Running all diagnostics');
      // Fire events for plugins that have sf-doctor hooks
      this.config.plugins.forEach((plugin) => {
        const eventName = `sf-doctor-${plugin.name}`;
        if (plugin.hooks && Object.keys(plugin.hooks).find((hook) => hook === eventName)) {
          this.tasks.push(this.config.runHook(eventName, { doctor: this.doctor }));
        }
      });
      this.tasks = [...this.tasks, ...this.doctor.diagnose()];
    }

    await Promise.all(this.tasks);

    const diagnosis = this.doctor.getDiagnosis();
    const diagnosisLocation = this.doctor.writeFileSync(
      path.join(this.outputDir, 'diagnosis.json'),
      JSON.stringify(diagnosis, null, 2)
    );
    this.filesWrittenMsgs.push(`Wrote doctor diagnosis to: ${diagnosisLocation}`);

    this.log();
    this.filesWrittenMsgs.forEach((msg) => this.log(msg));

    this.log();
    this.styledHeader('Suggestions');
    diagnosis.suggestions.forEach((s) => this.log(`  * ${s}`));

    if (createissueFlag) {
      const raw = 'https://raw.githubusercontent.com/forcedotcom/cli/main/.github/ISSUE_TEMPLATE/bug_report.md';
      const ghIssue = await got(raw, {
        throwHttpErrors: false,
        agent: { https: ProxyAgent(getProxyForUrl(raw)) },
      });

      const title: Record<string, string> = await this.prompt({
        type: 'input',
        name: 'title',
        message: 'Enter a title for your new issue',
      });
      const url = encodeURI(
        `https://github.com/forcedotcom/cli/issues/new?title=${title.title}&body=${this.generateIssueMarkdown(
          ghIssue.body,
          diagnosis
        )}&labels=doctor,investigating,${this.config.bin}`
      );
      await this.openUrl(url);
    }

    return diagnosis;
  }

  /**
   * Only made into its own method for unit testing purposes
   *
   * @param url: url string to open
   */
  // eslint-disable-next-line class-methods-use-this
  private async openUrl(url: string): Promise<void> {
    await open(url);
  }

  private generateIssueMarkdown(body: string, diagnosis: SfDoctorDiagnosis): string {
    const info = `
\`\`\`
${diagnosis.cliConfig.userAgent}
${diagnosis.versionDetail.pluginVersions?.join(os.EOL)}
\`\`\`
${
  diagnosis.sfdxEnvVars.length
    ? `
\`\`\`
SFDX ENV. VARS.
${diagnosis.sfdxEnvVars.join(os.EOL)}
\`\`\`
`
    : ''
}

${
  diagnosis.sfEnvVars.length
    ? `
\`\`\`
SF ENV. VARS.
${diagnosis.sfEnvVars.join(os.EOL)}
\`\`\`
`
    : ''
}
\`\`\`
Windows: ${diagnosis.cliConfig.windows}
Shell: ${diagnosis.cliConfig.shell}
Channel: ${diagnosis.cliConfig.channel}
${diagnosis.cliConfig.userAgent}
\`\`\`
---
### Diagnostics
${this.doctor
  .getDiagnosis()
  .diagnosticResults.map(
    (res) => `${res.status === 'pass' ? ':white_check_mark:' : ':x:'} ${res.status} - ${res.testName}`
  )
  .join(os.EOL)}
`;
    return body
      .replace(new RegExp(`---(.|${os.EOL})*---${os.EOL}${os.EOL}`), '')
      .replace(new RegExp(`${os.EOL}- Which shell/terminal (.|${os.EOL})*- Paste the output here`), info);
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
    this.styledHeader('Running command with debugging');
    this.log(`${cmdString}\n`);
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
