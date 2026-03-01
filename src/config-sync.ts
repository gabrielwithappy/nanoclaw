import fs from 'fs';
import path from 'path';

import { logger } from './logger.js';
import { getAllRegisteredGroups, setRegisteredGroup } from './db.js';

/**
 * Synchronize group container configs between DB and JSON files.
 * The config files are the Source of Truth for container configurations.
 */
export function syncGroupConfigs(): void {
    const configDir = path.resolve(process.cwd(), 'config', 'groups');

    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        logger.info('Created config/groups directory');
    }

    const currentGroups = getAllRegisteredGroups();
    let updatedDbCount = 0;
    let createdFileCount = 0;

    for (const [jid, group] of Object.entries(currentGroups)) {
        const filePath = path.join(configDir, `${group.folder}.json`);

        // If config file doesn't exist, seed it from DB
        if (!fs.existsSync(filePath)) {
            const initialConfig = group.containerConfig || {};
            fs.writeFileSync(filePath, JSON.stringify(initialConfig, null, 2));
            createdFileCount++;
            continue;
        }

        // If config file exists, read it and sync TO the DB (File is source of truth)
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const config = JSON.parse(content);

            const existingConfigStr = JSON.stringify(group.containerConfig || {});
            const newConfigStr = JSON.stringify(config);

            if (existingConfigStr !== newConfigStr) {
                group.containerConfig = Object.keys(config).length > 0 ? config : undefined;
                setRegisteredGroup(jid, group);
                updatedDbCount++;
                logger.info(
                    { folder: group.folder },
                    'Synced container configuration from JSON to database',
                );
            }
        } catch (err) {
            logger.error(
                { folder: group.folder, err },
                'Failed to parse group config JSON',
            );
        }
    }

    if (updatedDbCount > 0 || createdFileCount > 0) {
        logger.info(
            { updatedDbCount, createdFileCount },
            'Finished syncing group configs',
        );
    }
}
