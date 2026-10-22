import { CONFIG } from './config.js';
import { createBot } from './bot.js';

if (!CONFIG.TELEGRAM_BOT_TOKEN) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN is missing in environment or .env file.');
  console.log('👉 Create a bot via @BotFather on Telegram and set TELEGRAM_BOT_TOKEN in .env');
  process.exit(1);
}

const bot = createBot(CONFIG.TELEGRAM_BOT_TOKEN);

bot.catch((err) => {
  console.error('❌ Telegram Bot Error caught:', err.error || err);
});

console.log(`🤖 Starting Solana Route Bot...`);
console.log(`📡 Network: ${CONFIG.SOLANA_NETWORK} (${CONFIG.SOLANA_RPC_URL})`);

bot.start({
  drop_pending_updates: true,
  onStart: (botInfo) => {
    console.log(`✅ Bot successfully connected as @${botInfo.username}`);
  }
});
