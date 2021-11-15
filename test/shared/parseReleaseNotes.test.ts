/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect, use as chaiUse } from 'chai';
import * as Sinon from 'sinon';
import * as SinonChai from 'sinon-chai';
import { spyMethod } from '@salesforce/ts-sinon';
import { fs } from '@salesforce/core';
import { marked } from 'marked';
import { parseReleaseNotes } from '../../src/shared/parseReleaseNotes';

chaiUse(SinonChai);

describe('parseReleaseNotes tests', () => {
  const sandbox = Sinon.createSandbox();
  const notes = fs.readFileSync(`${__dirname}/../fixtures/notes.md`, 'utf8');
  const baseUrl = 'https://github.com/forcedotcom/cli/tree/main/releasenotes/sfdx';

  let lexerSpy: Sinon.SinonSpy;

  beforeEach(() => {
    lexerSpy = spyMethod(sandbox, marked, 'lexer');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('calls lexer with raw release notes', async () => {
    parseReleaseNotes(notes, '7.121.8', baseUrl);

    expect(lexerSpy.called).to.be.true;
    expect(lexerSpy.args[0][0]).to.deep.equal(notes);
  });

  it('filters out correct version from tokens', async () => {
    const tokens = parseReleaseNotes(notes, '7.121.8', baseUrl);

    const results = JSON.stringify(tokens, null, '  ');

    expect(tokens[0].raw).to.include('7.121.8');
    expect(results).to.include('7.121.8');
    expect(results).to.not.include('7.123.0');
    expect(results).to.not.include('7.122.1');
    expect(results).to.not.include('7.120.0');
  });

  it('throws error if version is not found', async () => {
    try {
      parseReleaseNotes(notes, '1.2.3', baseUrl);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(err.message).to.equal(`Version '1.2.3' was not found. You can view release notes online at: ${baseUrl}`);
    }
  });

  it('fixes relative links in releasenotes', async () => {
    const tokens = parseReleaseNotes(notes, '7.121.8', baseUrl);

    const results = JSON.stringify(tokens, null, '  ');
    expect(results).to.include(`${baseUrl}/./test.md`);
  });
});
