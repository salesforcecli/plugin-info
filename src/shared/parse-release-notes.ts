/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { marked } from 'marked';

export function parseReleaseNotes(notes: string, version: string, baseUrl?: string): marked.Token[] {
  let found = false;

  const parsed = marked.lexer(notes);

  const tokens = parsed.filter((token) => {
    // TODO: Make header depth a setting in oclif.info?
    if (token.type === 'heading' && token.depth === 2) {
      if (token.text.includes(version)) {
        found = true;

        return token;
      }

      found = false;
    } else if (found === true) {
      return token;
    }
  });

  if (!tokens.length) {
    throw new Error(`Version '${version}' was not found. You can view release notes online at: ${baseUrl}`);
  }

  const fixRelativeLinks = (token: marked.Token): void => {
    // If link is relative, add the baseurl. https://regex101.com/r/h802kJ/1
    if (token.type === 'link' && !token.href.match(/(?:[a-z][a-z0-9+.-]*:|\/\/)/gi)) {
      token.href = `${baseUrl}/${token.href}`;
    }
  };

  marked.walkTokens(tokens, fixRelativeLinks);

  return tokens;
}
