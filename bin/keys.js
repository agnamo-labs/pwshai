const fs = require('fs');
const path = require('path');
const os = require('os');
const prompts = require('prompts');
const { PROVIDERS, resolveProvider, providerChoices } = require('../lib/providers');

const HERMES_DIR = path.join(os.homedir(), '.hermes');
const DOTENV_PATH = path.join(HERMES_DIR, '.env');
const HERMES_CONFIG_PATH = path.join(HERMES_DIR, 'config.yaml');
const PI_ENV_PATH = path.join(HERMES_DIR, 'pi.env');
const OPENCODE_ENV_PATH = path.join(HERMES_DIR, 'opencode.env');

function loadKeys() {
	let keys = {};
	if (fs.existsSync(DOTENV_PATH)) {
		const raw = fs.readFileSync(DOTENV_PATH, 'utf-8');
		raw.split('\n').forEach(line => {
			const match = line.match(/^([^=]+)=(.*)$/);
			if (match) keys[match[1].trim()] = match[2].trim();
		});
	}
	return keys;
}

function saveKeys(keys) {
	const dir = path.dirname(DOTENV_PATH);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

	let out = '';
	for (const [k, v] of Object.entries(keys)) {
		out += `${k}=${v}\n`;
	}
	fs.writeFileSync(DOTENV_PATH, out, 'utf-8');
}

// Display only last-4 plus length — never the key itself.
function maskKey(value) {
	if (!value || typeof value !== 'string') return '*** (0 chars)';
	return `***${value.slice(-4)} (${value.length} chars)`;
}

function ensureHermesDir() {
	if (!fs.existsSync(HERMES_DIR)) fs.mkdirSync(HERMES_DIR, { recursive: true });
}

// --- Harness config writers (secrets never go into these files) ---

function writeHermesConfig(provider, keyEnv) {
	const yaml = [
		'# ~/.hermes/config.yaml — written by pwshai /keys (bin/keys.js)',
		'# Provider base URLs and default models for the hermes harness.',
		'# Secrets are never stored here; they live in ~/.hermes/.env.',
		'# Set the runtime key from that file, e.g.: HERMES_API_KEY="$DEEPSEEK_API_KEY"',
		'',
		'providers:',
		`  ${provider.slug}:`,
		`    base_url: ${provider.baseUrl}`,
		`    key_env: ${keyEnv}`,
		`    default_model: ${provider.defaultModel}`,
		`    openai_compatible: ${provider.openaiCompatible}`,
		'',
		`active_provider: ${provider.slug}`,
		''
	].join('\n');
	fs.writeFileSync(HERMES_CONFIG_PATH, yaml, 'utf-8');
	return yaml;
}

function writePiEnv(provider, keyEnv) {
	const env = [
		'# ~/.hermes/pi.env — written by pwshai /keys (bin/keys.js)',
		'# Pi harness provider configuration. The API key is NOT stored here.',
		`# Resolve it from ~/.hermes/.env at runtime, e.g.:`,
		`#   export PI_API_KEY="${keyEnv}"  # value sourced from ~/.hermes/.env`,
		'#   pi --model "$PI_MODEL"',
		'',
		`PI_BASE_URL=${provider.baseUrl}`,
		`PI_MODEL=${provider.defaultModel}`,
		`PI_OPENAI_COMPATIBLE=${provider.openaiCompatible}`,
		`# PI_API_KEY=${keyEnv}  # secret lives in ~/.hermes/.env, not in this file`,
		''
	].join('\n');
	fs.writeFileSync(PI_ENV_PATH, env, 'utf-8');
	return env;
}

function writeOpencodeEnv(provider, keyEnv) {
	const env = [
		'# ~/.hermes/opencode.env — written by pwshai /keys (bin/keys.js)',
		'# OpenCode harness provider configuration. The API key is NOT stored here.',
		`# Resolve it from ~/.hermes/.env at runtime, e.g.:`,
		`#   export OPENCODE_API_KEY="${keyEnv}"  # value sourced from ~/.hermes/.env`,
		'#   opencode',
		'',
		`OPENCODE_BASE_URL=${provider.baseUrl}`,
		`OPENCODE_MODEL=${provider.defaultModel}`,
		`OPENCODE_OPENAI_COMPATIBLE=${provider.openaiCompatible}`,
		`# OPENCODE_API_KEY=${keyEnv}  # secret lives in ~/.hermes/.env, not in this file`,
		''
	].join('\n');
	fs.writeFileSync(OPENCODE_ENV_PATH, env, 'utf-8');
	return env;
}

// Generated config snippet for on-screen confirmation — key value never included.
function generateConfigSnippet(provider, keyEnv) {
	const parts = [
		`~/.hermes/.env:`,
		`  ${keyEnv}=***${'x'.repeat(4)}  (key value not printed)`,
		'',
		`~/.hermes/config.yaml (hermes):`,
		`  providers.${provider.slug}.base_url = ${provider.baseUrl}`,
		`  providers.${provider.slug}.default_model = ${provider.defaultModel}`,
		`  providers.${provider.slug}.openai_compatible = ${provider.openaiCompatible}`,
		`  active_provider = ${provider.slug}`,
		'',
		`~/.hermes/pi.env (pi):`,
		`  PI_BASE_URL = ${provider.baseUrl}`,
		`  PI_MODEL = ${provider.defaultModel}`,
		`  PI_OPENAI_COMPATIBLE = ${provider.openaiCompatible}`,
		`  PI_API_KEY = ${keyEnv}  (resolved from ~/.hermes/.env)`,
		'',
		`~/.hermes/opencode.env (opencode):`,
		`  OPENCODE_BASE_URL = ${provider.baseUrl}`,
		`  OPENCODE_MODEL = ${provider.defaultModel}`,
		`  OPENCODE_OPENAI_COMPATIBLE = ${provider.openaiCompatible}`,
		`  OPENCODE_API_KEY = ${keyEnv}  (resolved from ~/.hermes/.env)`
	];
	return parts.join('\n');
}

function saveProviderKey(provider, keyVal) {
	const keys = loadKeys();
	keys[provider.keyEnv] = keyVal;
	saveKeys(keys);
	ensureHermesDir();
	writeHermesConfig(provider, provider.keyEnv);
	writePiEnv(provider, provider.keyEnv);
	writeOpencodeEnv(provider, provider.keyEnv);
	return generateConfigSnippet(provider, provider.keyEnv);
}

async function manageKeys() {
	const bgBlack = '\x1b[48;2;0;0;0m';
	const cyan = '\x1b[36m';
	const magenta = '\x1b[35m';
	const white = '\x1b[97m';
	const bold = '\x1b[1m';
	const reset = '\x1b[0m';
	const dim = '\x1b[2m';

	console.clear();
	console.log(`\n${bgBlack}${bold}${magenta}┌─── ORBITAL KEY MANAGEMENT ─────────────┐${reset}`);

	const keys = loadKeys();
	const existing = Object.keys(keys);

	if (existing.length === 0) {
		console.log(`${bgBlack}${magenta}│${reset}${bgBlack} ${dim}No keys currently stored in ${DOTENV_PATH}${reset}`);
	} else {
		existing.forEach(k => {
			const preview = maskKey(keys[k]);
			console.log(`${bgBlack}${magenta}│${reset}${bgBlack} ${cyan}[*]${reset}${bgBlack} ${white}${k.padEnd(20)}${reset}${bgBlack} : ${dim}${preview}${reset}`);
		});
	}
	console.log(`${bgBlack}${bold}${magenta}└────────────────────────────────────────┘${reset}\n`);

	const action = await prompts({
		type: 'select',
		name: 'val',
		message: 'Select action',
		choices: [
			{ title: 'Add/Update Key', value: 'add' },
			{ title: 'Delete Key', value: 'del' },
			{ title: 'Exit', value: 'exit' }
		]
	});

	if (action.val === 'add') {
		const providerChoice = await prompts({
			type: 'select',
			name: 'slug',
			message: 'Select provider (or Custom for a free-text env name)',
			choices: [
				...providerChoices(),
				{ title: 'Custom / free-text env name', value: 'custom' }
			]
		});

		if (!providerChoice.slug) return;

		if (providerChoice.slug === 'custom') {
			// Existing free-text entry path — keep working for anything not in the registry.
			const res = await prompts([
				{ type: 'text', name: 'keyName', message: 'Enter Key Name (e.g. OPENAI_API_KEY):' },
				{ type: 'password', name: 'keyVal', message: 'Enter Key Value:' }
			]);
			if (res.keyName && res.keyVal) {
				keys[res.keyName.toUpperCase()] = res.keyVal;
				saveKeys(keys);
				console.log(`\n${bgBlack}${cyan}[=] Key saved to secure vault!${reset}`);
				console.log(`${bgBlack}  ${dim}${res.keyName.toUpperCase()}: ${maskKey(res.keyVal)}${reset}\n`);
			}
			return;
		}

		const provider = resolveProvider(providerChoice.slug);
		if (!provider) {
			console.log(`\n${bgBlack}${magenta}[!] Unknown provider slug: ${providerChoice.slug}${reset}\n`);
			return;
		}

		const res = await prompts({
			type: 'password',
			name: 'keyVal',
			message: `Enter Key Value for ${provider.keyEnv}:`
		});
		if (!res.keyVal) {
			console.log(`\n${bgBlack}${magenta}[!] No key value provided, aborted.${reset}\n`);
			return;
		}

		const snippet = saveProviderKey(provider, res.keyVal);
		console.log(`\n${bgBlack}${cyan}[=] Key saved to secure vault!${reset}`);
		console.log(`${bgBlack}  ${dim}${provider.keyEnv}: ${maskKey(res.keyVal)}${reset}`);
		console.log(`${bgBlack}  ${dim}Wrote harness config for hermes / pi / opencode under ${HERMES_DIR}${reset}\n`);
		console.log(`${bgBlack}${bold}${white}[ Written config (key value withheld) ]${reset}`);
		console.log(`${bgBlack}${dim}${snippet}${reset}\n`);
	} else if (action.val === 'del') {
		if (existing.length === 0) return;
		const res = await prompts({
			type: 'select',
			name: 'k',
			message: 'Select key to delete',
			choices: existing.map(e => ({ title: e, value: e }))
		});
		if (res.k) {
			delete keys[res.k];
			saveKeys(keys);
			console.log(`\n${bgBlack}${cyan}[=] Key deleted!${reset}\n`);
		}
	}
}

// Allow require() from tests without running the interactive UI.
if (require.main === module) {
	manageKeys().catch(e => console.error(e));
}

module.exports = {
	loadKeys,
	saveKeys,
	maskKey,
	PROVIDERS,
	resolveProvider,
	providerChoices,
	ensureHermesDir,
	writeHermesConfig,
	writePiEnv,
	writeOpencodeEnv,
	generateConfigSnippet,
	saveProviderKey,
	manageKeys,
	DOTENV_PATH,
	HERMES_CONFIG_PATH,
	PI_ENV_PATH,
	OPENCODE_ENV_PATH
};
