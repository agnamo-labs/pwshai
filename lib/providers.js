// Provider registry for BYOK harness configuration.
// One row per provider: slug, baseUrl, keyEnv, defaultModel, openaiCompatible.
//
// Only base URLs that are verifiable are hardcoded. `atlas_cloud`, `wiro` and
// `unlid` have no confirmed API root in the estate, so they are intentionally
// omitted here and require an explicit --base-url instead.

const PROVIDERS = {
	deepseek: {
		name: 'DeepSeek',
		slug: 'deepseek',
		baseUrl: 'https://api.deepseek.com/v1',
		keyEnv: 'DEEPSEEK_API_KEY',
		defaultModel: 'deepseek-chat',
		openaiCompatible: true
	},
	nous: {
		name: 'Nous Research',
		slug: 'nous',
		baseUrl: 'https://inference-api.nousresearch.com/v1',
		keyEnv: 'NOUS_API_KEY',
		defaultModel: 'Nous-Hermes-2-Mixtral-8x7B-DPO',
		openaiCompatible: true
	},
	openrouter: {
		name: 'OpenRouter',
		slug: 'openrouter',
		baseUrl: 'https://openrouter.ai/api/v1',
		keyEnv: 'OPENROUTER_API_KEY',
		defaultModel: 'openrouter/auto',
		openaiCompatible: true
	},
	venice: {
		name: 'Venice.ai',
		slug: 'venice',
		baseUrl: 'https://api.venice.ai/api/v1',
		keyEnv: 'VENICE_API_KEY',
		defaultModel: 'venice-uncensored',
		openaiCompatible: true
	},
	xai: {
		name: 'xAI',
		slug: 'xai',
		baseUrl: 'https://api.x.ai/v1',
		keyEnv: 'XAI_API_KEY',
		defaultModel: 'grok-beta',
		openaiCompatible: true
	},
	featherless: {
		name: 'Featherless AI',
		slug: 'featherless',
		baseUrl: 'https://api.featherless.ai/v1',
		keyEnv: 'FEATHERLESS_API_KEY',
		defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
		openaiCompatible: true
	},
	'openai-compatible': {
		name: 'OpenAI-compatible (generic)',
		slug: 'openai-compatible',
		baseUrl: 'https://api.openai.com/v1',
		keyEnv: 'OPENAI_API_KEY',
		defaultModel: 'gpt-4o-mini',
		openaiCompatible: true
	}
};

function resolveProvider(slug) {
	if (!slug || typeof slug !== 'string') {
		return undefined;
	}
	const direct = PROVIDERS[slug];
	if (direct) return direct;
	const byKey = Object.values(PROVIDERS).find(p => p.keyEnv === slug.toUpperCase());
	return byKey || undefined;
}

function providerSlugs() {
	return Object.keys(PROVIDERS);
}

function providerChoices() {
	return Object.values(PROVIDERS).map(p => ({
		title: `${p.name} (${p.slug})`,
		value: p.slug,
		description: `${p.baseUrl} · ${p.keyEnv} · default model ${p.defaultModel}`
	}));
}

module.exports = {
	PROVIDERS,
	resolveProvider,
	providerSlugs,
	providerChoices
};
