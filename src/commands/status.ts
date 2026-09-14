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

import { SfCommand } from '@salesforce/sf-plugins-core';
import {
  AuthInfo,
  ConfigAggregator,
  Messages,
  OrgConfigProperties,
  SfProject,
  StateAggregator,
} from '@salesforce/core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-info', 'status');

type ConfigEntry = {
  value: string;
  location: string;
};

type OrgDetail = {
  username: string;
  alias?: string;
  orgId?: string;
  instanceUrl?: string;
  isScratchOrg?: boolean;
  isDevHub?: boolean;
  isSandbox?: boolean;
  tracksSource?: boolean;
  expirationDate?: string;
  error?: string;
};

type ProjectInfo = {
  path: string;
  defaultPackagePath?: string;
  packageDirectories: Array<{ path: string; default?: boolean }>;
  namespace?: string;
  sourceApiVersion?: string;
};

type StatusResult = {
  config: Record<string, ConfigEntry>;
  targetOrg?: OrgDetail;
  targetDevHub?: OrgDetail;
  project?: ProjectInfo;
  cli: {
    version: string;
    node: string;
    os?: string;
    shell?: string;
    arch: string;
  };
};

const CONFIG_KEYS = [
  OrgConfigProperties.TARGET_ORG,
  OrgConfigProperties.TARGET_DEV_HUB,
  OrgConfigProperties.ORG_API_VERSION,
  OrgConfigProperties.ORG_INSTANCE_URL,
] as const;

function locationLabel(info: { isLocal: () => boolean; isGlobal: () => boolean; isEnvVar: () => boolean }): string {
  if (info.isEnvVar()) return 'environment';
  if (info.isLocal()) return 'local';
  if (info.isGlobal()) return 'global';
  return 'unknown';
}

function buildConfigEntries(aggregator: ConfigAggregator): Record<string, ConfigEntry> {
  const entries: Record<string, ConfigEntry> = {};
  for (const key of CONFIG_KEYS) {
    const info = aggregator.getInfo(key);
    if (info.value != null && typeof info.value === 'string') {
      entries[key] = {
        value: info.value,
        location: locationLabel(info),
      };
    }
  }
  return entries;
}

function buildProjectInfo(): ProjectInfo | undefined {
  try {
    const project = SfProject.getInstance();
    const json = project.getSfProjectJson();
    const contents = json.getContents();
    const pkgDirs = project.getPackageDirectories();
    const defaultDir = pkgDirs.find((d) => d.default);
    const info: ProjectInfo = {
      path: project.getPath(),
      packageDirectories: pkgDirs.map((d) => {
        const entry: { path: string; default?: boolean } = { path: d.path };
        if (d.default) entry.default = true;
        return entry;
      }),
    };
    if (defaultDir) info.defaultPackagePath = defaultDir.path;
    if (contents.namespace) info.namespace = contents.namespace;
    if (contents.sourceApiVersion) info.sourceApiVersion = contents.sourceApiVersion;
    return info;
  } catch {
    return undefined;
  }
}

async function resolveOrgDetail(aliasOrUsername: string): Promise<OrgDetail> {
  try {
    const stateAgg = await StateAggregator.getInstance();
    const username = stateAgg.aliases.resolveUsername(aliasOrUsername);
    const alias = username !== aliasOrUsername ? aliasOrUsername : undefined;
    const authInfo = await AuthInfo.create({ username });
    const fields = authInfo.getFields();
    const detail: OrgDetail = { username };
    if (alias) detail.alias = alias;
    if (fields.orgId) detail.orgId = fields.orgId;
    if (fields.instanceUrl) detail.instanceUrl = fields.instanceUrl;
    const rawFields = fields as Record<string, unknown>;
    if (fields.devHubUsername || rawFields['isScratch']) detail.isScratchOrg = true;
    if (fields.isDevHub) detail.isDevHub = true;
    if (rawFields['isSandbox']) detail.isSandbox = true;
    if (fields.tracksSource != null) detail.tracksSource = Boolean(fields.tracksSource);
    const expDate = fields.expirationDate ?? (rawFields['trailExpirationDate'] as string | undefined);
    if (expDate) detail.expirationDate = String(expDate);
    return detail;
  } catch (e) {
    return { username: aliasOrUsername, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export default class Status extends SfCommand<StatusResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly enableJsonFlag = true;

  // eslint-disable-next-line class-methods-use-this
  public jsonEnabled(): boolean {
    return true;
  }

  public async run(): Promise<StatusResult> {
    await this.parse(Status);

    const aggregator = await ConfigAggregator.create();
    const config = buildConfigEntries(aggregator);
    const versionDetails = this.config.versionDetails;

    const result: StatusResult = {
      config,
      project: buildProjectInfo(),
      cli: {
        version: versionDetails.cliVersion,
        node: versionDetails.nodeVersion,
        os: versionDetails.osVersion,
        shell: versionDetails.shell,
        arch: versionDetails.architecture,
      },
    };

    const targetOrgValue = config[OrgConfigProperties.TARGET_ORG]?.value;
    const targetDevHubValue = config[OrgConfigProperties.TARGET_DEV_HUB]?.value;

    if (targetOrgValue) result.targetOrg = await resolveOrgDetail(targetOrgValue);
    if (targetDevHubValue) result.targetDevHub = await resolveOrgDetail(targetDevHubValue);

    return result;
  }
}
