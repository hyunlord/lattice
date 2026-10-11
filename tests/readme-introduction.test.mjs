import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { extractMarkdown } from '../dist/index.js';
const description = (text, path = 'README.md') => extractMarkdown({ path, text, contentHash: createHash('sha256').update(text).digest('hex') }).nodes[0].attributes.sourceDescription;

test('setext titles and decorative subtitles do not truncate the repository overview', () => {
    assert.equal(description('Finder\n------\nFinder recursively searches files for patterns.\n\n### Usage\nRun finder.').text, 'Finder recursively searches files for patterns.');
    const value = description('**_Note:This repository requires large file support before cloning_**\n\n# Racing Demo\n###### Engine demonstration\n\n![badge](badge.svg)\n\nThis project demonstrates rendering in a small racing game.');
    assert.equal(value.text, 'This project demonstrates rendering in a small racing game.');
    assert.equal(value.line, 8);
});

test('HTML narrative headings survive indentation while linked navigation and notices are ignored', () => {
    const value = description('<h4>\n  <a href="/">Editor</a> | <a href="/docs">Documentation</a>\n</h4>\n<div align="center">\n  <h2>\n    An open source collaborative diagram editor. <br />\n    Store drawings locally.\n  </h2>\n</div>');
    assert.equal(value.text, 'An open source collaborative diagram editor.');
    assert.equal(value.line, 6);
});

test('overview prose under ordinary headings is found without treating setup instructions as purpose', () => {
    const value = description('# Sample\n\n## Diagrams\n\nSee the presentation here: [slides](https://example.invalid).\n\n> **Note:** The slides describe an older version.\n> For up-to-date information, refer to the documentation.\n\n## Run locally\n\nSample is a web application built using standard build tools.\nInstall the runtime before starting.');
    assert.equal(value.text, 'Sample is a web application built using standard build tools.');
    assert.equal(value.line, 12);
    assert.equal(description('# Sample\n\n## Setup\n\nFirst, configure the library.'), undefined);
});

test('RST titles and directives preserve the first repository prose and its source line', () => {
    const value = description('======\nClient\n======\n\n.. image:: https://example.invalid/badge.svg\n   :target: https://example.invalid\n\n.. warning:: Development snapshot.\n\nClient is a command line toolkit for applications.\n\nInstallation\n------------\n\nRun the installer.', 'README.rst');
    assert.equal(value.text, 'Client is a command line toolkit for applications.');
    assert.equal(value.line, 10);
});
