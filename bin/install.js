#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Colors
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

// Get version from package.json
const pkg = require('../package.json');

const banner = `
${cyan}   ██████╗ ███████╗██████╗
  ██╔════╝ ██╔════╝██╔══██╗
  ██║  ███╗███████╗██║  ██║
  ██║   ██║╚════██║██║  ██║
  ╚██████╔╝███████║██████╔╝
   ╚═════╝ ╚══════╝╚═════╝${reset}

  Get Shit Done ${dim}v${pkg.version}${reset}
  A meta-prompting, context engineering and spec-driven
  development system for Claude Code and Codex CLI by TÂCHES.
`;

// Parse args
const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');
const hasCodex = args.includes('--codex');
const hasClaude = args.includes('--claude');

// Parse --config-dir argument
function parseConfigDirArg() {
  const configDirIndex = args.findIndex(arg => arg === '--config-dir' || arg === '-c');
  if (configDirIndex !== -1) {
    const nextArg = args[configDirIndex + 1];
    // Error if --config-dir is provided without a value or next arg is another flag
    if (!nextArg || nextArg.startsWith('-')) {
      console.error(`  ${yellow}--config-dir requires a path argument${reset}`);
      process.exit(1);
    }
    return nextArg;
  }
  // Also handle --config-dir=value format
  const configDirArg = args.find(arg => arg.startsWith('--config-dir=') || arg.startsWith('-c='));
  if (configDirArg) {
    return configDirArg.split('=')[1];
  }
  return null;
}
const explicitConfigDir = parseConfigDirArg();
// Parse --tool argument
function parseToolArg() {
  const toolIndex = args.findIndex(arg => arg === '--tool' || arg === '-t');
  if (toolIndex !== -1) {
    const nextArg = args[toolIndex + 1];
    if (!nextArg || nextArg.startsWith('-')) {
      console.error(`  ${yellow}--tool requires a value (claude|codex)${reset}`);
      process.exit(1);
    }
    return nextArg;
  }
  const toolArg = args.find(arg => arg.startsWith('--tool=') || arg.startsWith('-t='));
  if (toolArg) {
    return toolArg.split('=')[1];
  }
  return null;
}
const explicitTool = parseToolArg();
const hasHelp = args.includes('--help') || args.includes('-h');

console.log(banner);

function normalizeTool(tool) {
  if (!tool) return null;
  const lower = tool.toLowerCase();
  if (lower === 'claude' || lower === 'claude-code') return 'claude';
  if (lower === 'codex') return 'codex';
  return null;
}

const normalizedExplicitTool = normalizeTool(explicitTool);
if (explicitTool && !normalizedExplicitTool) {
  console.error(`  ${yellow}Unknown tool "${explicitTool}". Use "claude" or "codex".${reset}`);
  process.exit(1);
}

if (hasCodex && hasClaude) {
  console.error(`  ${yellow}Cannot specify both --codex and --claude${reset}`);
  process.exit(1);
}

if ((hasCodex && normalizedExplicitTool && normalizedExplicitTool !== 'codex') ||
    (hasClaude && normalizedExplicitTool && normalizedExplicitTool !== 'claude')) {
  console.error(`  ${yellow}--tool conflicts with --codex/--claude${reset}`);
  process.exit(1);
}

const tool = normalizedExplicitTool || (hasCodex ? 'codex' : 'claude');

// Show help if requested
if (hasHelp) {
  console.log(`  ${yellow}Usage:${reset} npx get-shit-done-cc [options]

  ${yellow}Options:${reset}
    ${cyan}-g, --global${reset}              Install globally (to Claude config directory)
    ${cyan}-l, --local${reset}               Install locally (to ./.claude in current directory)
    ${cyan}-c, --config-dir <path>${reset}   Specify custom config directory (Claude/Codex)
    ${cyan}-t, --tool <name>${reset}         Target tool: claude | codex (default: claude)
    ${cyan}--claude${reset}                   Shortcut for --tool claude
    ${cyan}--codex${reset}                    Shortcut for --tool codex
    ${cyan}-h, --help${reset}                Show this help message

  ${yellow}Examples:${reset}
    ${dim}# Install to default ~/.claude directory${reset}
    npx get-shit-done-cc --global

    ${dim}# Install to custom config directory (for multiple Claude accounts)${reset}
    npx get-shit-done-cc --global --config-dir ~/.claude-bc

    ${dim}# Using environment variable${reset}
    CLAUDE_CONFIG_DIR=~/.claude-bc npx get-shit-done-cc --global

    ${dim}# Install to current project only${reset}
    npx get-shit-done-cc --local

    ${dim}# Install Codex prompts globally${reset}
    npx get-shit-done-cc --tool codex --global

    ${dim}# Install Codex prompts to this project${reset}
    npx get-shit-done-cc --codex --local

  ${yellow}Notes:${reset}
    The --config-dir option is useful when you have multiple Claude Code
    configurations (e.g., for different subscriptions). It takes priority
    over the CLAUDE_CONFIG_DIR environment variable.
    For Codex, --config-dir overrides CODEX_HOME for global installs.
`);
  process.exit(0);
}

/**
 * Expand ~ to home directory (shell doesn't expand in env vars passed to node)
 */
function expandTilde(filePath) {
  if (filePath && filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Recursively copy directory, transforming .md files
 */
function copyWithTransform(srcDir, destDir, transformContent) {
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyWithTransform(srcPath, destPath, transformContent);
    } else if (entry.name.endsWith('.md')) {
      let content = fs.readFileSync(srcPath, 'utf8');
      content = transformContent(content);
      fs.writeFileSync(destPath, content);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function createContentTransform(pathPrefix, targetTool) {
  return (content) => {
    let updated = content.replace(/~\/\.claude\//g, pathPrefix);
    if (targetTool === 'codex') {
      updated = updated.replace(/\/gsd:([A-Za-z0-9-]+)/g, '/prompts:gsd-$1');
      updated = updated.replace(/\/gsd-([A-Za-z0-9-]+)/g, '/prompts:gsd-$1');
      updated = updated.replace(/^name:\s*gsd:(.+)$/m, (_match, rest) => `name: gsd-${rest.trim()}`);
    }
    return updated;
  };
}

function getToolConfig(targetTool, isGlobal) {
  const toolDirName = targetTool === 'codex' ? '.codex' : '.claude';
  const envVar = targetTool === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR';
  const configDir = expandTilde(explicitConfigDir) || expandTilde(process.env[envVar]);
  const defaultGlobalDir = configDir || path.join(os.homedir(), toolDirName);
  const rootDir = isGlobal
    ? defaultGlobalDir
    : path.join(process.cwd(), toolDirName);

  const locationLabel = isGlobal
    ? rootDir.replace(os.homedir(), '~')
    : rootDir.replace(process.cwd(), '.');

  const pathPrefix = isGlobal
    ? (configDir ? `${rootDir}/` : `~/${toolDirName}/`)
    : `./${toolDirName}/`;

  return {
    toolDirName,
    configDir,
    rootDir,
    locationLabel,
    pathPrefix,
  };
}

function clearOldCodexPrompts(promptsDir) {
  if (!fs.existsSync(promptsDir)) {
    return;
  }
  const entries = fs.readdirSync(promptsDir);
  for (const entry of entries) {
    if (!entry.startsWith('gsd-') || !entry.endsWith('.md')) {
      continue;
    }
    fs.rmSync(path.join(promptsDir, entry), { force: true });
  }
}

/**
 * Install to the specified directory
 */
function install(targetTool, isGlobal) {
  const src = path.join(__dirname, '..');
  const { rootDir, locationLabel, pathPrefix } = getToolConfig(targetTool, isGlobal);
  const transformContent = createContentTransform(pathPrefix, targetTool);

  console.log(`  Installing to ${cyan}${locationLabel}${reset}\n`);

  if (targetTool === 'codex') {
    const promptsDir = path.join(rootDir, 'prompts');
    fs.mkdirSync(promptsDir, { recursive: true });
    clearOldCodexPrompts(promptsDir);

    const gsdSrc = path.join(src, 'commands', 'gsd');
    const commandFiles = fs.readdirSync(gsdSrc).filter(file => file.endsWith('.md'));
    for (const file of commandFiles) {
      const srcPath = path.join(gsdSrc, file);
      const baseName = path.basename(file, '.md');
      const destPath = path.join(promptsDir, `gsd-${baseName}.md`);
      let content = fs.readFileSync(srcPath, 'utf8');
      content = transformContent(content);
      fs.writeFileSync(destPath, content);
    }
    console.log(`  ${green}✓${reset} Installed Codex prompts (${commandFiles.length})`);

    const skillSrc = path.join(src, 'get-shit-done');
    const skillDest = path.join(rootDir, 'get-shit-done');
    copyWithTransform(skillSrc, skillDest, transformContent);
    console.log(`  ${green}✓${reset} Installed get-shit-done`);

    const changelogSrc = path.join(src, 'CHANGELOG.md');
    const changelogDest = path.join(rootDir, 'get-shit-done', 'CHANGELOG.md');
    if (fs.existsSync(changelogSrc)) {
      fs.copyFileSync(changelogSrc, changelogDest);
      console.log(`  ${green}✓${reset} Installed CHANGELOG.md`);
    }

    const versionDest = path.join(rootDir, 'get-shit-done', 'VERSION');
    fs.writeFileSync(versionDest, pkg.version);
    console.log(`  ${green}✓${reset} Wrote VERSION (${pkg.version})`);

    console.log(`
  ${green}Done!${reset} Launch Codex CLI and run ${cyan}/prompts:gsd-help${reset}.
`);

    if (!isGlobal) {
      const codexHome = path.join(process.cwd(), '.codex');
      console.log(`  ${yellow}Note:${reset} Set ${cyan}CODEX_HOME${reset} to ${cyan}${codexHome}${reset} before launching Codex.`);
    }
    return;
  }

  // Claude Code install
  const commandsDir = path.join(rootDir, 'commands');
  fs.mkdirSync(commandsDir, { recursive: true });

  const gsdSrc = path.join(src, 'commands', 'gsd');
  const gsdDest = path.join(commandsDir, 'gsd');
  copyWithTransform(gsdSrc, gsdDest, transformContent);
  console.log(`  ${green}✓${reset} Installed commands/gsd`);

  const skillSrc = path.join(src, 'get-shit-done');
  const skillDest = path.join(rootDir, 'get-shit-done');
  copyWithTransform(skillSrc, skillDest, transformContent);
  console.log(`  ${green}✓${reset} Installed get-shit-done`);

  const changelogSrc = path.join(src, 'CHANGELOG.md');
  const changelogDest = path.join(rootDir, 'get-shit-done', 'CHANGELOG.md');
  if (fs.existsSync(changelogSrc)) {
    fs.copyFileSync(changelogSrc, changelogDest);
    console.log(`  ${green}✓${reset} Installed CHANGELOG.md`);
  }

  const versionDest = path.join(rootDir, 'get-shit-done', 'VERSION');
  fs.writeFileSync(versionDest, pkg.version);
  console.log(`  ${green}✓${reset} Wrote VERSION (${pkg.version})`);

  console.log(`
  ${green}Done!${reset} Launch Claude Code and run ${cyan}/gsd:help${reset}.
`);
}

/**
 * Prompt for install location
 */
function promptLocation(targetTool) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const { rootDir, locationLabel } = getToolConfig(targetTool, true);
  const globalLabel = locationLabel;
  const localLabel = targetTool === 'codex' ? './.codex' : './.claude';

  console.log(`  ${yellow}Where would you like to install?${reset}

  ${cyan}1${reset}) Global ${dim}(${globalLabel})${reset} - available in all projects
  ${cyan}2${reset}) Local  ${dim}(${localLabel})${reset} - this project only
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    rl.close();
    const choice = answer.trim() || '1';
    const isGlobal = choice !== '2';
    install(targetTool, isGlobal);
  });
}

// Main
if (hasGlobal && hasLocal) {
  console.error(`  ${yellow}Cannot specify both --global and --local${reset}`);
  process.exit(1);
} else if (explicitConfigDir && hasLocal) {
  console.error(`  ${yellow}Cannot use --config-dir with --local${reset}`);
  process.exit(1);
} else if (hasGlobal) {
  install(tool, true);
} else if (hasLocal) {
  install(tool, false);
} else {
  promptLocation(tool);
}
