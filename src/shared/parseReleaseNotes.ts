/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { marked } from 'marked';
import * as semver from 'semver';

const parseReleaseNotes = (notes: string, version: string, baseUrl: string): marked.Token[] => {
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
        const coercedVersion = semver.coerce(token.text).version;

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
    const semverRange = `${semver.major(version)}.${semver.minor(version)}.x`;

    closestVersion = semver.maxSatisfying<string>(versions, semverRange);

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

export { parseReleaseNotes };
