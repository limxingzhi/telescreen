// ms integration tests
// Run: node scripts/ms.test.js
// Starts server on a random port, tests via HTTP, then cleans up.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3459;
const ADDR = '127.0.0.1';
const FIXTURES = path.join(__dirname, '..', 'test-fixtures');

let pass = 0;
let fail = 0;

function assert(condition, msg) {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.error('  FAIL:', msg);
  }
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: ADDR, port: PORT, path: url }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

function setup(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function write(file, content) {
  fs.writeFileSync(file, content);
}

function symlink(target, link) {
  fs.symlinkSync(target, link);
}

function clean(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

async function main() {
  clean(FIXTURES);
  setup(FIXTURES);

  // Import server module, restart on test port
  const ms = require('./ms');
  await new Promise((resolve, reject) => {
    ms.server.close();
    ms.server.listen(PORT, ADDR, resolve);
  });

  console.log('=== ms integration tests ===\n');

  // ---- Tracer bullet: frontmatter renders as table with Field/Value headers ----
  console.log('1) Frontmatter table has Field/Value headers');
  {
    write(path.join(FIXTURES, 'test.md'), `---
title: Test Page
author: Alice
---

# Hello
`);
    const { body, status } = await get('/test-fixtures/test.md');
    assert(status === 200, 'status 200, got ' + status);
    assert(body.includes('Field'), 'body contains "Field" header');
    assert(body.includes('Value'), 'body contains "Value" header');
    assert(body.includes('Test Page'), 'body contains frontmatter value "Test Page"');
    assert(body.includes('Alice'), 'body contains frontmatter value "Alice"');
    assert(!body.includes('| | |'), 'body does NOT contain empty headers');
  }

  // ---- Test: plain markdown renders normally ----
  console.log('2) Plain markdown without frontmatter renders normally');
  {
    write(path.join(FIXTURES, 'plain.md'), '# Just a title\n\nSome paragraph.');
    const { body, status } = await get('/test-fixtures/plain.md');
    assert(status === 200, 'status 200');
    assert(body.includes('Just a title'), 'contains rendered heading');
    assert(body.includes('Some paragraph'), 'contains rendered paragraph');
    assert(body.includes('markdown-body'), 'wrapped in GitHub CSS');
  }

  // ---- Test: directory path returns listing ----
  console.log('3) Directory path returns file listing');
  {
    const { body, status } = await get('/test-fixtures/');
    assert(status === 200, 'status 200, got ' + status);
    assert(body.includes('test.md'), 'body lists test.md');
    assert(body.includes('plain.md'), 'body lists plain.md');
    assert(body.includes('<a'), 'body contains links');
  }

  // ---- Test: non-existent file returns 404 ----
  console.log('4) Non-existent file returns 404');
  {
    const { status } = await get('/test-fixtures/nonexistent.md');
    assert(status === 404, 'status 404, got ' + status);
  }

  // ---- Test: mermaid code block loads mermaid.js ----
  console.log('5) Mermaid code block loads mermaid.js CDN');
  {
    write(path.join(FIXTURES, 'diagram.md'), '# Diagram\n\n```mermaid\ngraph TD; A-->B;\n```\n');
    const { body, status } = await get('/test-fixtures/diagram.md');
    assert(status === 200, 'status 200');
    assert(body.includes('mermaid.min.js'), 'includes mermaid.js CDN');
    assert(body.includes('class="mermaid"'), 'has mermaid pre block');
  }

  // ---- Test: static file serving ----
  console.log('6) Static file serving (non-.md)');
  {
    write(path.join(FIXTURES, 'image.png'), 'fake-png');
    const { status, headers } = await get('/test-fixtures/image.png');
    assert(status === 200, 'status 200');
    assert(headers['content-type'] === 'image/png', 'correct MIME type');
  }

  // ---- Test: symlink outside ROOT returns 403 ----
  console.log('7) Symlink outside ROOT returns 403');
  {
    symlink('/etc/passwd', path.join(FIXTURES, 'escape'));
    const { status, body } = await get('/test-fixtures/escape');
    assert(status === 403, 'status 403, got ' + status);
    assert(body === 'Forbidden', 'body is "Forbidden", got ' + JSON.stringify(body));
  }

  // ---- Summary ----
  console.log(`\n${pass + fail} tests, ${pass} pass, ${fail} fail`);
  ms.server.close();
  clean(FIXTURES);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
