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

import { EOL } from 'node:os';
import { resolve as pathResolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { Flags, loglevel, SfCommand, StandardColors } from '@salesforce/sf-plugins-core';
import { Lifecycle, Messages, SfError } from '@salesforce/core';
import open from 'open';
import got from 'got';
import { ProxyAgent } from 'proxy-agent';
import { Doctor as SFDoctor, SfDoctor, SfDoctorDiagnosis } from '../doctor.js';
import { DiagnosticStatus } from '../diagnostics.js';
import { prompts } from '../shared/prompts.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-info', 'doctor');

export default class Doctor extends SfCommand<SfDoctorDiagnosis> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    command: Flags.string({
      char: 'c',
      summary: messages.getMessage('flags.command.summary'),
    }),
    plugin: Flags.string({
      char: 'p',
      summary: messages.getMessage('flags.plugin.summary'),
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
  private doctor!: SfDoctor;
  private outputDir: string = process.cwd();
  private filesWrittenMsgs: string[] = [];

  public async run(): Promise<SfDoctorDiagnosis> {
    const { flags } = await this.parse(Doctor);
    this.doctor = SFDoctor.init(this.config);
    const lifecycle = Lifecycle.getInstance();

    this.outputDir = pathResolve(flags['output-dir'] ?? process.cwd());

    lifecycle.on<DiagnosticStatus>('Doctor:diagnostic', async (data) => {
      const colorMap = {
        pass: StandardColors.success,
        fail: StandardColors.error,
        warn: StandardColors.warning,
        unknown: StandardColors.warning,
      } as const;
      const colorFn = colorMap[data.status];
      this.log(`${colorFn(data.status)} - ${data.testName}`);
      return Promise.resolve(this.doctor.addDiagnosticStatus(data));
    });

    if (flags.command) {
      this.setupCommandExecution(flags.command);
    }

    if (flags.plugin) {
      // verify the plugin flag matches an installed plugin
      const plugin = this.config.getPluginsList().find((p) => p.name === flags.plugin);
      if (plugin) {
        const eventName = `sf-doctor-${flags.plugin}`;
        const hasDoctorHook = plugin.hooks && Object.keys(plugin.hooks).some((hook) => hook === eventName);
        if (hasDoctorHook) {
          this.styledHeader(`Running diagnostics for plugin: ${flags.plugin}`);
          this.tasks.push(this.runDoctorHook(eventName));
        } else {
          this.log(`${flags.plugin} doesn't have diagnostic tests to run.`);
        }
      } else {
        throw new SfError(messages.getMessage('pluginNotInstalledError', [flags.plugin]), 'UnknownPluginError');
      }
    } else {
      this.styledHeader('Running all diagnostics');
      // Fire events for plugins that have sf-doctor hooks
      this.config.getPluginsList().forEach((plugin) => {
        const eventName = `sf-doctor-${plugin.name}`;
        if (plugin.hooks && Object.keys(plugin.hooks).find((hook) => hook === eventName)) {
          this.tasks.push(this.runDoctorHook(eventName));
        }
      });
      this.doctor.diagnose().map((p) => this.tasks.push(p));
    }

    await Promise.all(this.tasks);

    const diagnosis = this.doctor.getDiagnosis();
    const diagnosisLocation = this.doctor.writeFileSync(
      join(this.outputDir, 'diagnosis.json'),
      JSON.stringify(diagnosis, null, 2)
    );
    this.filesWrittenMsgs.push(`Wrote doctor diagnosis to: ${diagnosisLocation}`);

    this.log();
    this.filesWrittenMsgs.forEach((msg) => this.log(msg));

    this.log();
    this.styledHeader('Suggestions');
    const pinnedCount = 2;
    const pinned = diagnosis.suggestions.slice(0, pinnedCount);
    const actionable = diagnosis.suggestions.slice(pinnedCount);
    if (actionable.length) {
      actionable.forEach((s) => this.log(`  ${StandardColors.warning('⚠')} ${s}`));
      this.log();
    }
    pinned.forEach((s) => this.log(`  * ${s}`));

    if (flags['create-issue']) {
      const raw = 'https://raw.githubusercontent.com/forcedotcom/cli/main/.github/ISSUE_TEMPLATE/bug_report.md';
      const ghIssue = await got(raw, {
        throwHttpErrors: false,
        agent: { https: new ProxyAgent() },
      });

      const title = await prompts.titleInput();

      const url = encodeURI(
        `https://github.com/forcedotcom/cli/issues/new?title=${title}&body=${this.generateIssueMarkdown(
          ghIssue.body,
          diagnosis
        )}&labels=doctor,investigating,${this.config.bin}&template=bug_report`
      )
        // # were not encoding correctly from encodeURI to be parsed in the issue body
        .replace(/#/g, '%23');
      await this.openUrl(url);
    }

    return diagnosis;
  }

  private runDoctorHook(event: string): Promise<unknown> {
    return this.config.runHook(event, { doctor: this.doctor });
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
    const diagnosticIcon = (status: string): string => {
      if (status === 'pass') return ':white_check_mark:';
      if (status === 'warn') return ':warning:';
      return ':x:';
    };

    const systemInfo = [
      '```',
      'CLI:',
      diagnosis.cliConfig.userAgent,
      '',
      'Plugin Version:',
      ...diagnosis.versionDetail.pluginVersions,
      '```',
      ...(diagnosis.sfdxEnvVars.length ? ['', '```', 'SFDX ENV. VARS.', ...diagnosis.sfdxEnvVars, '```'] : []),
      ...(diagnosis.sfEnvVars.length ? ['', '```', 'SF ENV. VARS.', ...diagnosis.sfEnvVars, '```'] : []),
      '',
      '```',
      `Windows: ${diagnosis.cliConfig.windows}`,
      `Shell: ${diagnosis.cliConfig.shell}`,
      `Channel: ${diagnosis.cliConfig.channel}`,
      '```',
      '---',
      '### Diagnostics',
      ...this.doctor
        .getDiagnosis()
        .diagnosticResults.map((res) => `${diagnosticIcon(res.status)} ${res.status} - ${res.testName}`),
    ].join(EOL);

    // Remove the frontmatter and Note block, but preserve Summary, Steps To Reproduce,
    // and all other sections. Replace the System Information placeholder with actual data.
    return body
      .replace(/---\nname:[\s\S]*?---\n/, '')
      .replace(/> \*\*Note\*\*[\s\S]*?> {3}- If you require immediate assistance.*\n/m, '')
      .replace(/> \[!TIP\]\n>.*\n/m, '')
      .replace(/<!-- Which shell[\s\S]*PASTE_VERSION_OUTPUT_HERE\n```/m, systemInfo)
      .trim();
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
      const stdoutLogLocation = this.doctor.getDoctoredFilePath(join(this.outputDir, 'command-stdout.log'));
      const debugLogLocation = this.doctor.getDoctoredFilePath(join(this.outputDir, 'command-debug.log'));
      this.doctor.createStdoutWriteStream(stdoutLogLocation);
      this.doctor.createStderrWriteStream(debugLogLocation);
      const cp = spawn(cmdString, [], {
        shell: true,
        env: Object.assign(
          {},
          {
            ...process.env,
            SF_LOG_COLORIZE: 'false',
          }
        ),
      });

      cp.on('error', (err) => {
        this.log(`Error executing command: ${err.message}`);
        // no-op
      });
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      cp.stdout.on('data', async (data: string) => {
        await this.doctor.writeStdout(data.toString());
      });
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      cp.stderr.on('data', async (data: string) => {
        await this.doctor.writeStderr(data.toString());
      });
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      cp.on('exit', async (code) => {
        this.doctor.setExitCode(code ?? 0);
        await this.doctor.writeStdout(`\nCommand exit code: ${code ?? 'null'}\n`);
        this.doctor.closeStdout();
        this.doctor.closeStderr();
        this.filesWrittenMsgs.push(`Wrote command stdout log to: ${stdoutLogLocation}`);
        this.filesWrittenMsgs.push(`Wrote command debug log to: ${debugLogLocation}`);
        resolve();
      });
    });
    this.tasks.push(execPromise);
  }
}
