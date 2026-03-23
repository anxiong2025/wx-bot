#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig, saveConfig } from "./config.js";
import { Gateway } from "./gateway.js";
import { setLogLevel, createLogger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
const VERSION = pkg.version as string;

const log = createLogger("cli");

const HELP = `
  \x1b[1mwechat-ai\x1b[0m — WeChat AI Bot

  \x1b[1m命令:\x1b[0m
    wechat-ai                        启动 (首次自动扫码登录)
    wechat-ai set <provider> <key>   设置模型 API Key
    wechat-ai use <provider>         设置默认模型
    wechat-ai config                 查看当前配置
    wechat-ai update                 更新到最新版
    wechat-ai help                   显示帮助

  \x1b[1m设置 API Key:\x1b[0m
    wechat-ai set qwen sk-xxx        设置通义千问 Key
    wechat-ai set deepseek sk-xxx    设置 DeepSeek Key
    wechat-ai set claude sk-xxx      设置 Claude Key

  \x1b[1m设置默认模型:\x1b[0m
    wechat-ai use qwen               默认使用 Qwen
    wechat-ai use deepseek           默认使用 DeepSeek

  \x1b[1m微信指令:\x1b[0m
    /model             查看当前模型
    /model qwen        切换到 Qwen
    /model deepseek    切换到 DeepSeek
    /help              显示帮助
`;

function printBanner(defaultProvider: string): void {
  const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    gray: "\x1b[90m",
    white: "\x1b[97m",
    orange: "\x1b[38;5;208m",
    border: "\x1b[38;5;60m",  // muted blue-gray, similar to Claude Code
  };

  const boxW = 44;
  const inner = boxW - 2;
  const b = c.border;
  const empty = `  ${b}│${c.reset}${" ".repeat(inner)}${b}│${c.reset}`;

  const displayWidth = (s: string) => {
    const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
    let w = 0;
    for (const ch of stripped) {
      const code = ch.codePointAt(0)!;
      w += (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)
        || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60) ? 2 : 1;
    }
    return w;
  };
  const center = (s: string) => {
    const w = displayWidth(s);
    const left = Math.floor((inner - w) / 2);
    const right = inner - w - left;
    return `  ${b}│${c.reset}${" ".repeat(left)}${s}${" ".repeat(right)}${b}│${c.reset}`;
  };
  // Title embedded in top border, centered
  const titleText = ` Wechat AI v${VERSION} `;
  const titleLen = titleText.length;
  const sideL = Math.floor((inner - titleLen) / 2);
  const sideR = inner - titleLen - sideL;
  const topBorder = `  ${b}╭${"─".repeat(sideL)}${c.reset}${c.bold}${c.white}${titleText}${c.reset}${b}${"─".repeat(sideR)}╮${c.reset}`;

  // Icons: WeChat (green) ◄──► Claude (orange), centered
  const icons = [
    `${c.green}╭───╮${c.reset}            ${c.orange}╭───╮${c.reset}`,
    `${c.green}│° °│${c.reset}   ${c.dim}◄══►${c.reset}   ${c.orange}│◉ ◉│${c.reset}`,
    `${c.green}╰─∪─╯${c.reset}            ${c.orange}╰─╮─╯${c.reset}`,
  ];

  const welcome = `${c.bold}${c.white}Welcome!${c.reset}`;
  const info = `${c.dim}model: ${defaultProvider} · type /help in chat${c.reset}`;

  console.log();
  console.log(topBorder);
  console.log(empty);
  console.log(center(welcome));
  console.log(empty);
  for (const line of icons) {
    console.log(center(line));
  }
  console.log(empty);
  console.log(center(info));
  console.log(`  ${b}╰${"─".repeat(inner)}╯${c.reset}`);
  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const logLevel = (process.env.WAI_LOG_LEVEL || "info") as "debug" | "info" | "warn" | "error";
  setLogLevel(logLevel);

  if (command === "--version" || command === "-v") {
    console.log(`wechat-ai v${VERSION}`);
    process.exit(0);
  }

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  const config = await loadConfig();

  switch (command) {
    case "set": {
      const provider = args[1];
      const apiKey = args[2];

      if (!provider || !apiKey) {
        console.log("用法: wechat-ai set <provider> <key>");
        console.log("示例: wechat-ai set qwen sk-xxx");
        process.exit(1);
      }

      if (!config.providers[provider]) {
        console.log(`未知模型: ${provider}`);
        console.log(`可用: ${Object.keys(config.providers).join(", ")}`);
        process.exit(1);
      }

      config.providers[provider]!.apiKey = apiKey;
      await saveConfig(config);
      console.log(`\x1b[32m✓\x1b[0m 已保存 ${provider} 的 API Key`);
      break;
    }

    case "use": {
      const provider = args[1];

      if (!provider) {
        console.log(`当前默认模型: ${config.defaultProvider}`);
        console.log(`可用: ${Object.keys(config.providers).join(", ")}`);
        break;
      }

      if (!config.providers[provider]) {
        console.log(`未知模型: ${provider}`);
        console.log(`可用: ${Object.keys(config.providers).join(", ")}`);
        process.exit(1);
      }

      config.defaultProvider = provider;
      await saveConfig(config);
      console.log(`\x1b[32m✓\x1b[0m 默认模型已切换到 ${provider}`);
      break;
    }

    case "update": {
      const { execSync } = await import("node:child_process");
      console.log(`正在更新 wechat-ai... (当前 v${VERSION})`);
      try {
        execSync("npm i -g wechat-ai@latest", { stdio: "inherit" });
        // Read the newly installed version
        let newVersion = "latest";
        try {
          newVersion = execSync("npm info wechat-ai version", { encoding: "utf-8" }).trim();
        } catch { /* ignore */ }
        console.log(`\x1b[32m✓\x1b[0m 更新完成 v${VERSION} → v${newVersion}`);
      } catch {
        console.error("\x1b[31m✗\x1b[0m 更新失败，请手动执行: npm i -g wechat-ai@latest");
        process.exit(1);
      }
      break;
    }

    case "config": {
      // Hide API keys in output
      const display = JSON.parse(JSON.stringify(config));
      for (const p of Object.values(display.providers)) {
        const prov = p as Record<string, unknown>;
        if (prov.apiKey && typeof prov.apiKey === "string") {
          prov.apiKey = prov.apiKey.slice(0, 6) + "..." + prov.apiKey.slice(-4);
        }
      }
      console.log(JSON.stringify(display, null, 2));
      break;
    }

    default: {
      printBanner(config.defaultProvider);

      const gateway = new Gateway(config);
      gateway.init();

      const shutdown = async () => {
        await gateway.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      await gateway.start();
      break;
    }
  }
}

main().catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
