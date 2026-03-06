const fs = require('fs');
const path = require('path');
const os = require('os');

const claudeDir = path.join(os.homedir(), '.claude');
const statsPath = path.join(claudeDir, 'stats-cache.json');
const settingsPath = path.join(claudeDir, 'settings.json');
const snapshotPath = path.join(claudeDir, 'usage-snapshot.json');

try {
    let stats = {};
    if (fs.existsSync(statsPath)) {
        stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    } else {
        console.error("No stats-cache.json found. Tokens have not been tracked yet or file is missing.");
        process.exit(1);
    }

    let model = "claude-sonnet-4-5-20250929 (default)";
    if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (settings.model) model = settings.model;
    }

    const getModelTokens = () => {
        const res = {};
        if (stats.modelUsage) {
            for (const [m, usage] of Object.entries(stats.modelUsage)) {
                res[m] = {
                    input: usage.inputTokens || 0,
                    output: usage.outputTokens || 0,
                    cacheRead: usage.cacheReadInputTokens || 0,
                    cacheCreate: usage.cacheCreationInputTokens || 0,
                    total: (usage.inputTokens || 0) + (usage.outputTokens || 0) + (usage.cacheReadInputTokens || 0) + (usage.cacheCreationInputTokens || 0)
                };
            }
        }
        return res;
    };

    const action = process.argv[2];
    const currentTokens = getModelTokens();

    console.log(`=== Claude Code Usage Report ===`);
    console.log(`Currently Configured Model: ${model}`);

    if (action === 'start') {
        fs.writeFileSync(snapshotPath, JSON.stringify(currentTokens, null, 2));
        console.log(`\n[Snapshot Saved] The current token usage has been recorded.`);
        console.log(`Run 'node /home/node/.claude/skills/ccusage/scripts/get-usage.cjs end' to see tokens used during the session.`);
    } else if (action === 'end') {
        if (fs.existsSync(snapshotPath)) {
            console.log(`\n--- Task Token Usage (Difference) ---`);
            const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
            let diffFound = false;
            for (const [m, currentUsage] of Object.entries(currentTokens)) {
                const previousUsage = snapshot[m] || { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, total: 0 };
                const diffInput = currentUsage.input - previousUsage.input;
                const diffOutput = currentUsage.output - previousUsage.output;
                const diffCacheRead = currentUsage.cacheRead - previousUsage.cacheRead;
                const diffCacheCreate = currentUsage.cacheCreate - previousUsage.cacheCreate;
                const diffTotal = currentUsage.total - previousUsage.total;

                if (diffTotal > 0) {
                    diffFound = true;
                    console.log(`Model: ${m}`);
                    console.log(`  - Input Tokens: +${diffInput}`);
                    console.log(`  - Output Tokens: +${diffOutput}`);
                    console.log(`  - Cache Read Tokens: +${diffCacheRead}`);
                    console.log(`  - Cache Creation Tokens: +${diffCacheCreate}`);
                    console.log(`  => Total Used: ${diffTotal} tokens`);
                }
            }
            if (!diffFound) {
                console.log("No additional tokens were used since 'start'.");
            }
        } else {
            console.log("\nNo start snapshot found. Run the script with 'start' argument first.");
        }
    } else {
        // Cumulative report
        console.log(`\n--- Cumulative Token Usage by Model ---`);
        for (const [m, usage] of Object.entries(currentTokens)) {
            console.log(`Model: ${m}`);
            console.log(`  - Input: ${usage.input}, Output: ${usage.output}`);
            console.log(`  - Cache Read: ${usage.cacheRead}, Create: ${usage.cacheCreate}`);
            console.log(`  => Total (approx): ${usage.total}`);
        }
        console.log(`\nTip: You can use 'start' and 'end' arguments to track usage for a specific task.`);
    }
} catch (err) {
    console.error("Error calculating usage:", err.message);
}
