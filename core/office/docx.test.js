'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { readDocx, proposeDocxEdit, applyDocxEdit } = require('./docx');

async function makeDocx(paragraphs) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file('word/styles.xml', '<styles>KEEP-ME</styles>');
  const body = paragraphs
    .map((p) => `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${p}</w:t></w:r></w:p>`)
    .join('');
  zip.file('word/document.xml', `<w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('reads paragraph text', async () => {
  const buf = await makeDocx(['Hello &amp; welcome', 'Second']);
  assert.deepEqual(await readDocx(buf), ['Hello & welcome', 'Second']);
});

test('applies accepted edits as tracked changes, leaves the rest alone', async () => {
  const buf = await makeDocx(['One', 'Two', 'Three']);
  const changes = await proposeDocxEdit(buf, ['One', 'TWO <edited>', 'THREE']);
  assert.deepEqual(changes.map((c) => c.index), [1, 2]);

  const out = await applyDocxEdit(buf, changes, [1], { author: 'tester', date: '2026-01-01T00:00:00Z' });
  const zip = await JSZip.loadAsync(out);
  const xml = await zip.file('word/document.xml').async('string');

  assert.match(xml, /<w:del [^>]*w:author="tester"[^>]*><w:r><w:rPr><w:b\/><\/w:rPr><w:delText>Two<\/w:delText>/);
  assert.match(xml, /<w:ins [^>]*><w:r><w:t xml:space="preserve">TWO &lt;edited&gt;<\/w:t>/);
  assert.match(xml, /<w:t>Three<\/w:t>/); // rejected change untouched
  assert.equal(await zip.file('word/styles.xml').async('string'), '<styles>KEEP-ME</styles>');
});

test('rejects paragraph count changes and stale edits', async () => {
  const buf = await makeDocx(['A', 'B']);
  await assert.rejects(proposeDocxEdit(buf, ['A']), /paragraph count/);
  const changes = await proposeDocxEdit(buf, ['A', 'B2']);
  const stale = await makeDocx(['A', 'someone else edited']);
  await assert.rejects(applyDocxEdit(stale, changes, [1]), /changed since/);
});
