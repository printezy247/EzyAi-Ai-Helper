'use strict';

const JSZip = require('jszip');

/**
 * Phase 2 — .docx editing with real Word tracked changes.
 * Scope: paragraph-level text edits on documents whose paragraphs are
 * plain runs. An accepted edit wraps the paragraph's existing runs in
 * <w:del> and appends a <w:ins> run, so Word shows it as a reviewable
 * revision. Every other zip entry (styles, media, other parts) is copied
 * through unchanged; the zip container itself is re-written.
 * Not supported yet: adding/removing paragraphs, tables-aware edits,
 * paragraphs already containing revisions.
 */

const DOC_PATH = 'word/document.xml';
const PARA_RE = /<w:p(?=[\s>])[\s\S]*?<\/w:p>/g;
const RUN_RE = /<w:r(?=[\s>])[\s\S]*?<\/w:r>/g;

const unescapeXml = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function paragraphText(xml) {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => unescapeXml(m[1])).join('');
}

async function loadDocXml(buf) {
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file(DOC_PATH);
  if (!file) throw new Error('not a .docx: word/document.xml missing');
  return { zip, xml: await file.async('string') };
}

async function readDocx(buf) {
  const { xml } = await loadDocXml(buf);
  return (xml.match(PARA_RE) || []).map(paragraphText);
}

/** Compare new paragraph texts with the document; returns changed paragraphs. */
async function proposeDocxEdit(buf, newParagraphs) {
  const old = await readDocx(buf);
  if (old.length !== newParagraphs.length) {
    throw new Error(`paragraph count changed (${old.length} -> ${newParagraphs.length}); only in-place paragraph edits are supported`);
  }
  return old
    .map((text, index) => ({ index, old: text, new: newParagraphs[index] }))
    .filter((c) => c.old !== c.new);
}

/** Apply accepted changes (by paragraph index) as tracked revisions. */
async function applyDocxEdit(buf, changes, acceptedIndexes, { author = 'EzyAi', date = new Date().toISOString() } = {}) {
  const { zip, xml } = await loadDocXml(buf);
  const accepted = new Map(changes.filter((c) => acceptedIndexes.includes(c.index)).map((c) => [c.index, c]));
  let revId = 9000;
  let i = -1;
  const out = xml.replace(PARA_RE, (para) => {
    i++;
    const change = accepted.get(i);
    if (!change) return para;
    if (paragraphText(para) !== change.old) throw new Error(`paragraph ${i} changed since the edit was proposed`);
    if (/<w:(ins|del)[\s>]/.test(para)) throw new Error(`paragraph ${i} already has tracked changes; unsupported`);
    const attrs = () => `w:id="${revId++}" w:author="${escapeXml(author)}" w:date="${date}"`;
    let lastRunEnd = -1;
    const deleted = para.replace(RUN_RE, (run, offset) => {
      lastRunEnd = offset + run.length;
      const asDel = run.replace(/<w:t(?=[\s>])/g, '<w:delText').replace(/<\/w:t>/g, '</w:delText>');
      return `<w:del ${attrs()}>${asDel}</w:del>`;
    });
    const ins = `<w:ins ${attrs()}><w:r><w:t xml:space="preserve">${escapeXml(change.new)}</w:t></w:r></w:ins>`;
    const closeAt = deleted.lastIndexOf('</w:p>');
    return deleted.slice(0, closeAt) + ins + deleted.slice(closeAt);
  });
  zip.file(DOC_PATH, out);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { readDocx, proposeDocxEdit, applyDocxEdit };
