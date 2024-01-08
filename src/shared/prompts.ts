/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import input from '@inquirer/input';

// a wrapper object to make inquirer prompts stubbable by sinon
export const prompts = {
  titleInput: async (): Promise<string> =>
    input({
      message: 'Enter a title for your new issue',
    }),
};
