const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'infra/config.json')));
const source = fs.readFileSync(path.join(root, 'infra/legacy-redirect.js'), 'utf8').replace(/\r\n/g, '\n');
const context = vm.createContext({});
vm.runInContext(source, context);
const request = (host, uri, querystring = {}) => ({
  method: 'GET', uri, headers: { host: { value: host } }, querystring,
});

test('legacy pages redirect over HTTPS with their path and repeated encoded query values', () => {
  const result = context.handler({ request: request(config.legacy_domain, '/advisor3d/index.html', {
    q: { value: 'hello%20world' }, tag: { multiValue: [{ value: 'one' }, { value: 'two%26three' }] },
  }) });
  assert.equal(result.statusCode, 308);
  assert.equal(result.headers.location.value,
    `https://${config.site_domain}/advisor3d/index.html?q=hello%20world&tag=one&tag=two%26three`);
});

test('new hostname and unrelated hosts are passed through without loops', () => {
  for (const host of [config.site_domain, 'codehawks.org']) {
    const req = request(host, '/');
    assert.equal(context.handler({ request: req }), req);
  }
});

test('legacy API calls preserve their method, payload headers and request', () => {
  const req = request(config.legacy_domain, '/api/intake');
  req.method = 'POST';
  req.headers['x-amz-content-sha256'] = { value: 'payload-hash' };
  assert.equal(context.handler({ request: req }), req);
});

test('root redirect has no query separator when query is empty', () => {
  assert.equal(context.handler({ request: request(config.legacy_domain, '/') }).headers.location.value,
    `https://${config.site_domain}/`);
});

test('deployed function source exactly matches the tested source', () => {
  const template = JSON.parse(fs.readFileSync(path.join(root, 'infra/app.json')));
  assert.equal(template.Resources.LegacyRedirectFunction.Properties.FunctionCode, source.trimEnd());
});
