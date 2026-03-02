const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');
const DB_PATH = path.join(PROJECT_ROOT, 'store', 'messages.db');
const ALLOWLIST_PATH = path.join(os.homedir(), '.config', 'nanoclaw', 'mount-allowlist.json');
const OUT_JSON_PATH = path.join(__dirname, '../references/mount-status.json');

console.log('--- Mount Status Diagnostic Check ---');

let mountStatus = {
    allowlist: null,
    groups: [],
    issues: [],
    timestamp: new Date().toISOString()
};

// 1. Read allowlist
try {
    if (fs.existsSync(ALLOWLIST_PATH)) {
        mountStatus.allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf-8'));
        console.log(`[OK] Mount allowlist loaded: ${ALLOWLIST_PATH}`);
    } else {
        mountStatus.issues.push(`Mount allowlist not found at ${ALLOWLIST_PATH}`);
        console.log(`[WARNING] Mount allowlist NOT FOUND.`);
    }
} catch (e) {
    mountStatus.issues.push(`Invalid allowlist JSON: ${e.message}`);
    console.log(`[ERROR] Failed to parse allowlist: ${e.message}`);
}

// 2. Read group container configs from SQLite
if (fs.existsSync(DB_PATH)) {
    try {
        const db = new Database(DB_PATH, { readonly: true });
        const rows = db.prepare('SELECT jid, name, folder, container_config FROM registered_groups').all();

        for (const row of rows) {
            let config = null;
            if (row.container_config) {
                try {
                    config = JSON.parse(row.container_config);
                } catch (e) {
                    mountStatus.issues.push(`Invalid JSON config in DB for group '${row.name}': ${e.message}`);
                }
            }

            let mounts = [];
            if (config && config.additionalMounts) {
                mounts = config.additionalMounts;
            }

            const groupData = {
                jid: row.jid,
                name: row.name,
                folder: row.folder,
                mounts: mounts,
                hasContainerConfig: !!config
            };

            mountStatus.groups.push(groupData);

            if (mounts.length > 0) {
                console.log(`[INFO] Group '${row.name}' has ${mounts.length} additional mounts:`);
                mounts.forEach((m, idx) => {
                    console.log(`  - 📂 ${m.hostPath} (readonly: ${m.readonly ? 'yes' : 'no'})`);
                });
            } else {
                // Group has no mounts
            }
        }
    } catch (e) {
        mountStatus.issues.push(`Failed to read SQLite DB: ${e.message}`);
        console.log(`[ERROR] DB Error: ${e.message}`);
    }
} else {
    mountStatus.issues.push(`Database not found at ${DB_PATH}`);
    console.log(`[WARNING] Database NOT FOUND.`);
}

// 3. Write results to reference directory
fs.writeFileSync(OUT_JSON_PATH, JSON.stringify(mountStatus, null, 2));

console.log(`\n✅ Mount status successfully recorded to => ${OUT_JSON_PATH}`);
