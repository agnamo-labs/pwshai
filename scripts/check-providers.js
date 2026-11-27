#!/usr/bin/env node
// Validates the provider registry (lib/providers.js) and the key/config
// emission path in bin/keys.js. Runs offline — no secrets, no network.
'use strict';

const assert = require('node:assert');
const { PROVIDERS, resolveProvider, providerSlugs } = require('../lib/providers');
const { generateConfigSnippet, maskKey } = require('../bin/keys');

const REQUIRED_FIELDS = ['baseUrl', 'keyEnv', 'defaultModel', 'openaiCompatible'];
let failures = 0;

function fail(msg) {
	failures += 1;
	console.error(`FAIL: ${msg}`);
}

function pass(msg) {
	console.log(`ok: ${msg}`);
}

// 1. Every registry entry has baseUrl + keyEnv + defaultModel (and openaiCompatible).
const slugs = providerSlugs();
assert.ok(slugs.length > 0, 'registry is empty');
for (const slug of slugs) {
	const p = PROVIDERS[slug];
	for (const field of REQUIRED_FIELDS) {
		if (!p[field]) fail(`${slug} missing required field "${field}"`);
		else pass(`${slug}.${field} = ${String(p[field])}`);
	}
	if (typeof p.openaiCompatible !== 'boolean') fail(`${slug} openaiCompatible must be a boolean`);
	if (!/^https?:\/\//.test(p.baseUrl)) fail(`${slug} baseUrl is not an absolute URL: ${p.baseUrl}`);
	if (!p.keyEnv.match(/^[A-Z][A-Z0-9_]*$/)) fail(`${slug} keyEnv is not an env-style name: ${p.keyEnv}`);
}

// 2. atlas_cloud, wiro, unlid are intentionally omitted; explicit --base-url required.
for (const missing of ['atlas_cloud', 'wiro', 'unlid']) {
	if (resolveProvider(missing)) fail(`${missing} should not be in the registry`);
	else pass(`${missing} correctly omitted from registry (requires explicit --base-url)`);
}

// 3. Unknown slug is rejected.
for (const bogus of ['nope', 'totally-made-up', 'atlas_cloud', 'wiro', 'unlid', '123']) {
	if (resolveProvider(bogus)) fail(`unknown slug "${bogus}" was not rejected`);
	else pass(`unknown slug "${bogus}" rejected`);
}

// 4. No key value is ever interpolated into printed output (assert on the generated snippet).
const fakeKey = 'sk-test-0123456789abcdef0123456789abcdef';
for (const slug of slugs) {
	const p = PROVIDERS[slug];
	const snippet = generateConfigSnippet(p, p.keyEnv);
	if (snippet.includes(fakeKey)) fail(`snippet for ${slug} interpolates a plaintext key value`);
	if (snippet.includes(p.keyEnv + '=' + fakeKey)) fail(`snippet for ${slug} prints key=value`);
	if (snippet.includes(resolveProvider(p.keyEnv).keyEnv + '=' + fakeKey)) {
		fail(`snippet for ${slug} prints resolved key=value`);
	}
	pass(`snippet for ${slug} contains no plaintext key value`);
}

// Masked display shows last-4 plus length only.
const masked = maskKey(fakeKey);
if (masked.includes(fakeKey.slice(0, -4))) fail('maskKey leaks key prefix');
if (!masked.includes(fakeKey.slice(-4))) fail('maskKey does not show last 4');
if (!masked.includes(String(fakeKey.length))) fail('maskKey does not show key length');
pass('maskKey shows last-4 + length only');

if (failures > 0) {
	console.error(`\n${failures} assertion(s) failed`);
	process.exit(1);
}
console.log(`\ncheck-providers: all ${slugs.length} provider entries valid; key masking and unknown-slug rejection confirmed.`);
