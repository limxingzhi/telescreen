// Integration tests for ms — exercises the server via HTTP
const http = require('http');
const fs = require('fs');
const path = require('path');
const { strict: assert } = require('assert');

const { server, PORT, ADDR, ROOT, SHOW_HIDDEN, dirListing } = require('./ms');

const BASE = `http://${ADDR === '0.0.0.0' ? '127.0.0.1' : ADDR}:${PORT}`;

async function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

async function tests() {
  // Setup: create a temp dir with a space-named file
  const tmpDir = fs.mkdtempSync(path.join(ROOT, '/ms-test-'));
  const spaceFile = '001 - Essential Apps in China.md';
  const spacePath = path.join(tmpDir, spaceFile);
  fs.writeFileSync(spacePath, '---\ntitle: Test\n---\n\n# Hello World', 'utf8');

  // Also create a normal file for directory listing baseline
  fs.writeFileSync(path.join(tmpDir, 'normal.md'), '# Normal', 'utf8');

  // Hidden file for hidden-file listing tests
  fs.writeFileSync(path.join(tmpDir, '.hidden.md'), '# Hidden', 'utf8');

  const rel = path.relative(ROOT, tmpDir);

  // Test 1: URL-encoded path returns 200
  {
    const res = await get(`${BASE}/${rel}/${encodeURIComponent(spaceFile)}`);
    assert.equal(res.status, 200, `Expected 200, got ${res.status} for encoded path`);
    assert.match(res.body, /Hello World/, 'Expected rendered markdown content');
    console.log('PASS: URL-encoded path serves file with spaces');
  }

  // Test 2: Directory listing has properly encoded hrefs
  {
    const res = await get(`${BASE}/${rel}/`);
    assert.equal(res.status, 200, `Expected 200, got ${res.status} for directory listing`);
    assert.match(res.body, /Essential Apps/, 'Directory listing shows filename');
    assert.match(res.body, new RegExp(encodeURIComponent(spaceFile)), 'href contains encoded filename');
    console.log('PASS: Directory listing encodes spaces in hrefs');
  }

  // Test 3: Hidden files are excluded by default
  {
    const res = await get(`${BASE}/${rel}/`);
    assert.doesNotMatch(res.body, /hidden\.md/, 'Directory listing hides dotfiles by default');
    assert.equal(SHOW_HIDDEN, false, 'SHOW_HIDDEN defaults to false');
    console.log('PASS: Directory listing hides dotfiles by default');
  }

  // Test 4: Hidden files are shown when requested
  {
    const html = dirListing(tmpDir, '/', true);
    assert.match(html, /hidden\.md/, 'dirListing includes dotfiles when showHidden is true');
    console.log('PASS: Directory listing shows dotfiles when enabled');
  }

  // Test 5: .txt files are served as plain text, not downloaded
  {
    const txt = '# Not a heading\n<b>literal</b> & more\n';
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), txt, 'utf8');
    const res = await get(`${BASE}/${rel}/notes.txt`);
    assert.equal(res.status, 200, `Expected 200, got ${res.status} for .txt`);
    assert.match(res.headers['content-type'], /^text\/plain/, '.txt is served as text/plain');
    assert.equal(res.body, txt, '.txt content is returned verbatim');
    console.log('PASS: .txt files are served as plain text');
  }

  // Test 6: .log files are served as plain text, not downloaded
  {
    const log = '2026-01-01 INFO started\n2026-01-01 ERROR failed\n';
    fs.writeFileSync(path.join(tmpDir, 'app.log'), log, 'utf8');
    const res = await get(`${BASE}/${rel}/app.log`);
    assert.equal(res.status, 200, `Expected 200, got ${res.status} for .log`);
    assert.match(res.headers['content-type'], /^text\/plain/, '.log is served as text/plain');
    assert.equal(res.body, log, '.log content is returned verbatim');
    console.log('PASS: .log files are served as plain text');
  }

  // Test 7: .sh files are served as plain text, not downloaded
  {
    const sh = '#!/bin/sh\necho "hi"\n';
    fs.writeFileSync(path.join(tmpDir, 'run.sh'), sh, 'utf8');
    const res = await get(`${BASE}/${rel}/run.sh`);
    assert.equal(res.status, 200, `Expected 200, got ${res.status} for .sh`);
    assert.match(res.headers['content-type'], /^text\/plain/, '.sh is served as text/plain');
    assert.equal(res.body, sh, '.sh content is returned verbatim');
    console.log('PASS: .sh files are served as plain text');
  }

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('\nAll tests passed');
  server.close();
  process.exit(0);
}

// Wait for server to be listening
server.close(); // close the one that might already be running
server.listen(PORT, ADDR, tests);
