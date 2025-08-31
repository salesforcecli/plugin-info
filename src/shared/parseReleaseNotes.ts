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

import { marked } from 'marked';
import { coerce, major, minor, maxSatisfying } from 'semver';

export const parseReleaseNotes = (notes: string, version: string, baseUrl: string): marked.Token[] => {
  let found = false;
  let closestVersion: string | null = null;
  let versions: string[] = [];

  const parsed = marked.lexer(notes);

  const findVersion = (desiredVersion: string | null): marked.Token[] => {
    versions = [];

    if (desiredVersion === null) {
      return [];
    }

    return parsed.filter((token) => {
      // TODO: Could make header depth (2) a setting in oclif.info.releasenotes
      if (token.type === 'heading' && token.depth === 2) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const coercedVersion = coerce(token.text).version;

        // We will use this to find the closest patch if passed version is not found
        versions.push(coercedVersion);

        if (coercedVersion === desiredVersion) {
          found = true;

          return token;
        }

        found = false;
      } else if (found === true) {
        return token;
      }
    });
  };

  let tokens = findVersion(version);

  if (!tokens || tokens.length === 0) {
    // If version was not found, try again with the closest patch version
    const semverRange = `${major(version)}.${minor(version)}.x`;

    closestVersion = maxSatisfying<string>(versions, semverRange);

    tokens = findVersion(closestVersion);

    if (!tokens.length) {
      throw new Error(`Didn't find version '${version}'. View release notes online at: ${baseUrl}`);
    }
  }

  const fixRelativeLinks = (token: marked.Token): void => {
    // If link is relative, add the baseurl. https://regex101.com/r/h802kJ/1
    // FWIW: 'marked' does have a 'baseURL' option, but the 'marked-terminal' renderer does not honor it
    if (token.type === 'link' && !token.href.match(/(?:[a-z][a-z0-9+.-]*:|\/\/)/gi)) {
      token.href = `${baseUrl}/${token.href}`;
    }
  };

  marked.walkTokens(tokens, fixRelativeLinks);

  if (closestVersion !== null) {
    const warning = marked.lexer(
      `# ATTENTION: Version ${version} was not found. Showing notes for closest patch version ${closestVersion}.`
    )[0];

    tokens.unshift(warning);
  }

  return tokens;
};

export default { parseReleaseNotes };
