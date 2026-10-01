import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress, webArticleParts } from './web-preview.server.ts';

test('extracts ordered article headings and nested sections without page chrome', () => {
  const result = webArticleParts('<body><nav><h2>Menu</h2></nav><main><h1>Dubai</h1><p>Introduction &amp; history.</p><h2>Etymology</h2><p>Origins</p><h3>Name origins</h3><p>Details</p><h2>Geography</h2><p>Location</p><script><h2>Injected</h2></script></main><footer><h2>Links</h2></footer></body>');
  assert.equal(result.lead, 'Introduction & history.');
  assert.deepEqual(result.sections.map(({ title, level, text }) => ({ title, level, text })), [
    { title: 'Etymology', level: 1, text: 'Origins' },
    { title: 'Name origins', level: 2, text: 'Details' },
    { title: 'Geography', level: 1, text: 'Location' },
  ]);
});
test('keeps headings with no body and assigns unique section targets', () => {
  const result = webArticleParts('<main><h2>Same</h2><h2>Same</h2><p>Second</p></main>');
  assert.equal(result.sections.length, 2);
  assert.notEqual(result.sections[0].id, result.sections[1].id);
  assert.equal(result.sections[0].text, '');
});
test('rejects private, loopback and mapped addresses', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1', '2001:db8::1']) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
});
