/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import fs from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, use as chaiUse, assert } from 'chai';
import Sinon from 'sinon';
import SinonChai from 'sinon-chai';
import { spyMethod } from '@salesforce/ts-sinon';
import { marked } from 'marked';
import { parseReleaseNotes } from '../../src/shared/parseReleaseNotes.js';

chaiUse(SinonChai);

describe('parseReleaseNotes tests', () => {
  const sandbox = Sinon.createSandbox();
  const notes = fs.readFileSync(`${dirname(fileURLToPath(import.meta.url))}/../fixtures/notes.md`, 'utf8');
  const baseUrl = 'https://github.com/forcedotcom/cli/tree/main/releasenotes/sfdx';

  let lexerSpy: Sinon.SinonSpy;

  beforeEach(() => {
    lexerSpy = spyMethod(sandbox, marked, 'lexer');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('calls lexer with raw release notes', () => {
    parseReleaseNotes(notes, '7.121.8', baseUrl);

    expect(lexerSpy.called).to.be.true;
    expect(lexerSpy.args[0][0]).to.deep.equal(notes);
  });

  it('filters out correct version from tokens', () => {
    const tokens = parseReleaseNotes(notes, '7.121.8', baseUrl);

    const results = JSON.stringify(tokens, null, '  ');

    expect(tokens[0].raw).to.include('7.121.8');
    expect(results).to.include('7.121.8');
    expect(results).to.not.include('7.123.0');
    expect(results).to.not.include('7.122.1');
    expect(results).to.not.include('7.120.0');
  });

  it('throws error if version is not found', () => {
    try {
      parseReleaseNotes(notes, '1.2.3', baseUrl);
    } catch (err) {
      assert(err instanceof Error);
      expect(err.message).to.equal(`Didn't find version '1.2.3'. View release notes online at: ${baseUrl}`);
    }
  });

  it('matches entire version, not partial', () => {
    const tokens = parseReleaseNotes(notes, '13.3.1', baseUrl);

    const results = JSON.stringify(tokens, null, '  ');

    expect(tokens[0].raw).to.include('13.3.1');
    expect(results).to.include('- test for matching full version (`3.3.1 !== 13.3.1`)');

    try {
      // Won't find partial version (3.3.1 is part of 13.3.1)
      parseReleaseNotes(notes, '3.3.1', baseUrl);
    } catch (err) {
      assert(err instanceof Error);
      expect(err.message).to.equal(`Didn't find version '3.3.1'. View release notes online at: ${baseUrl}`);
    }
  });

  it('fixes relative links in releasenotes', () => {
    const tokens = parseReleaseNotes(notes, '7.121.8', baseUrl);

    const results = JSON.stringify(tokens, null, '  ');
    expect(results).to.include(`${baseUrl}/./test.md`);
  });

  it('finds a version above what was asked for if not found', () => {
    const tokens = parseReleaseNotes(notes, '63.17.0', baseUrl);

    const results = JSON.stringify(tokens, null, '  ');

    expect(tokens[1].raw).to.include('63.17.2');
    expect(results).to.include('- test for finding nearby versions');
  });

  it('finds a version below what was asked for if not found', () => {
    const tokens = parseReleaseNotes(notes, '63.17.5', baseUrl);

    const results = JSON.stringify(tokens, null, '  ');

    expect(tokens[1].raw).to.include('63.17.2');
    expect(results).to.include('- test for finding nearby versions');
  });

  it('finds highest version if multiple minors exist', () => {
    const tokens = parseReleaseNotes(notes, '63.18.0', baseUrl);

    const results = JSON.stringify(tokens, null, '  ');

    expect(tokens[1].raw).to.include('63.18.2'); // 63.18.1 exists in fixtures/notes
    expect(results).to.include('- testing multiple minors (higher)');
  });

  it('shows warning if a different version is shown', () => {
    const tokens = parseReleaseNotes(notes, '63.18.0', baseUrl);

    const results = JSON.stringify(tokens, null, '  ');

    expect(tokens[0].raw).to.include('63.18.0'); // version asked for
    expect(tokens[0].raw).to.include('63.18.2'); // version found
    expect(results).to.include(
      'ATTENTION: Version 63.18.0 was not found. Showing notes for closest patch version 63.18.2.'
    );
  });
});
