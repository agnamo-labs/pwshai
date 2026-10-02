const fs = require('fs');
const path = require('path');
const os = require('os');
const prompts = require('prompts');

const DOTENV_PATH = path.join(os.homedir(), '.hermes', '.env');

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
            const preview = keys[k].length > 10 ? keys[k].substring(0, 5) + '...' + keys[k].slice(-4) : '***';
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
        const res = await prompts([
            { type: 'text', name: 'keyName', message: 'Enter Key Name (e.g. OPENAI_API_KEY):' },
            { type: 'password', name: 'keyVal', message: 'Enter Key Value:' }
        ]);
        if (res.keyName && res.keyVal) {
            keys[res.keyName.toUpperCase()] = res.keyVal;
            saveKeys(keys);
            console.log(`\n${bgBlack}${cyan}[=] Key saved to secure vault!${reset}\n`);
        }
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

manageKeys().catch(e => console.error(e));
