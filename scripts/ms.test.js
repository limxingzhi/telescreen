// Integration tests for ms — exercises the server via HTTP
const http = require('http');
const fs = require('fs');
const path = require('path');
const { strict: assert } = require('assert');

const { server, PORT, ADDR, ROOT } = require('./ms');

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

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('\nAll tests passed');
  server.close();
  process.exit(0);
}

// Wait for server to be listening
server.close(); // close the one that might already be running
server.listen(PORT, ADDR, tests);
