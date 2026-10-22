import { Bot, InlineKeyboard, session } from 'grammy';
import { CONFIG } from './config.js';
import {
  isValidSolanaAddress,
  getWalletBalances,
  parseRecipients,
  buildBatchSolTransaction,
  generateBlinkActionUrl
} from './solana.js';

export function createBot(token) {
  const bot = new Bot(token);

  // In-memory lightweight session middleware
  bot.use(
    session({
      initial: () => ({
        step: 'idle',
        network: CONFIG.SOLANA_NETWORK,
        pendingBatch: null
      })
    })
  );

  // Main Menu Keyboard
  const mainMenuKeyboard = new InlineKeyboard()
    .text('⚡ New Batch Payout', 'action_payout')
    .text('🔍 Check Balance', 'action_balance')
    .row()
    .text('🔀 Multi-Hop Route', 'action_route')
    .text('🔗 Create Blink', 'action_blink')
    .row()
    .text(`🌐 Network: ${CONFIG.SOLANA_NETWORK.toUpperCase()}`, 'action_network');

  // Command: /start
  bot.command('start', async (ctx) => {
    ctx.session.step = 'idle';
    const welcome =
      `🚀 *Solana Velocity Split & Route Bot*\n\n` +
      `Autonomous treasury payouts, high-velocity batch transfers, and privacy routing on Solana.\n\n` +
      `• *Batch Multi-Send*: Disperse SOL/USDC to up to 20 wallets per transaction.\n` +
      `• *Privacy Routing*: Multi-hop intermediate transfers via MultiHopper API.\n` +
      `• *Non-Custodial*: Generates pre-built transactions for direct wallet signing.\n\n` +
      `Select an operation below:`;

    await ctx.reply(welcome, {
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard
    });
  });

  // Action: Network toggle
  bot.callbackQuery('action_network', async (ctx) => {
    ctx.session.network =
      ctx.session.network === 'devnet' ? 'mainnet-beta' : 'devnet';
    await ctx.answerCallbackQuery({
      text: `Switched network to ${ctx.session.network}`
    });
    await ctx.editMessageText(
      `🌐 *Active Solana Network*: \`${ctx.session.network}\``,
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text('⚡ New Batch Payout', 'action_payout')
          .text('🔍 Check Balance', 'action_balance')
          .row()
          .text(`🌐 Network: ${ctx.session.network.toUpperCase()}`, 'action_network')
      }
    );
  });

  // Action: Check Balance
  bot.callbackQuery('action_balance', async (ctx) => {
    ctx.session.step = 'awaiting_balance_address';
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `🔍 *Check Wallet Balance*\n\nPlease send the Solana public key you want to inspect:`,
      { parse_mode: 'Markdown' }
    );
  });

  // Action: New Batch Payout
  bot.callbackQuery('action_payout', async (ctx) => {
    ctx.session.step = 'awaiting_payout_list';
    await ctx.answerCallbackQuery();
    const prompt =
      `⚡ *New Batch Payout*\n\n` +
      `Send your recipient list. Each line must be:\n` +
      `\`<WalletAddress> <AmountInSOL>\`\n\n` +
      `*Example:*\n` +
      `\`7Xw...8Q2 0.5\`\n` +
      `\`9Yq...4K1 1.25\``;
    await ctx.reply(prompt, { parse_mode: 'Markdown' });
  });

  // Action: Multi-Hop Route
  bot.callbackQuery('action_route', async (ctx) => {
    await ctx.answerCallbackQuery();
    const msg =
      `🔀 *MultiHopper Privacy Route Generator*\n\n` +
      `Break on-chain heuristics by routing transfers through intermediate random or scheduled hops.\n\n` +
      `*Format:*\n` +
      `\`/route <RecipientAddress> <Amount> [Hops: 2-5]\`\n\n` +
      `*Example:*\n` +
      `\`/route 7Xw...8Q2 2.5 3\``;
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // Action: Create Blink
  bot.callbackQuery('action_blink', async (ctx) => {
    await ctx.answerCallbackQuery();
    const exampleBlink = generateBlinkActionUrl('https://dial.to/devnet', {
      action: 'solana-action:https://api.velocityroute.io/api/actions/split'
    });
    const msg =
      `🔗 *Solana Action & Blink Generator*\n\n` +
      `Turn any payout or split into a clickable Blink for Twitter/X and Telegram.\n\n` +
      `Example Action URL:\n\`${exampleBlink}\`\n\n` +
      `Users sign directly from their timeline with zero dApp connection friction.`;
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // Message Handler: Handles text inputs based on current session step
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();

    if (ctx.session.step === 'awaiting_balance_address') {
      if (!isValidSolanaAddress(text)) {
        await ctx.reply('❌ Invalid Solana address. Please send a valid Base58 public key.');
        return;
      }
      try {
        await ctx.reply('⏳ Querying RPC...');
        const balances = await getWalletBalances(text);
        const reply =
          `📊 *Wallet Balances*\n\n` +
          `• *Address*: \`${balances.address}\`\n` +
          `• *SOL*: \`${balances.sol.toFixed(4)} SOL\`\n` +
          `• *USDC*: \`${balances.usdc.toFixed(2)} USDC\`\n` +
          `• *Network*: \`${CONFIG.SOLANA_NETWORK}\``;
        ctx.session.step = 'idle';
        await ctx.reply(reply, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard });
      } catch (err) {
        await ctx.reply(`❌ RPC Error: ${err.message}`);
      }
      return;
    }

    if (ctx.session.step === 'awaiting_payout_list') {
      const { valid, errors } = parseRecipients(text);

      if (valid.length === 0) {
        await ctx.reply(
          `❌ No valid recipients found.\n\n` +
          `Errors:\n${errors.slice(0, 5).join('\n')}\n\n` +
          `Please provide at least 1 valid line: \`<Address> <Amount>\``
        );
        return;
      }

      ctx.session.pendingBatch = valid;
      ctx.session.step = 'confirming_batch';

      const totalSol = valid.reduce((acc, r) => acc + r.amount, 0);
      let summary =
        `📋 *Batch Payout Summary*\n\n` +
        `• *Recipients*: \`${valid.length}\`\n` +
        `• *Total Outflow*: \`${totalSol.toFixed(4)} SOL\`\n` +
        `• *Network*: \`${CONFIG.SOLANA_NETWORK}\`\n\n` +
        `*Recipients Preview:*\n`;

      valid.slice(0, 5).forEach((r, idx) => {
        summary += `${idx + 1}. \`${r.address.slice(0, 6)}...${r.address.slice(-4)}\`: *${r.amount} SOL*\n`;
      });

      if (valid.length > 5) {
        summary += `_...and ${valid.length - 5} more recipients._\n`;
      }

      if (errors.length > 0) {
        summary += `\n⚠️ *Ignored ${errors.length} invalid line(s)*.`;
      }

      const confirmKb = new InlineKeyboard()
        .text('✅ Generate Unsigned Tx', 'batch_generate_tx')
        .text('❌ Cancel', 'batch_cancel');

      await ctx.reply(summary, { parse_mode: 'Markdown', reply_markup: confirmKb });
      return;
    }

    // Default fallback
    await ctx.reply('Type /start to open the main menu.');
  });

  // Action: Generate Unsigned Tx
  bot.callbackQuery('batch_generate_tx', async (ctx) => {
    const recipients = ctx.session.pendingBatch;
    if (!recipients || recipients.length === 0) {
      await ctx.answerCallbackQuery({ text: 'Batch expired or empty.' });
      return;
    }

    await ctx.answerCallbackQuery();
    await ctx.reply('⚙️ Building transaction payload...');

    // Dummy fee payer placeholder for unsigned construction
    const placeholderPayer = recipients[0].address;
    try {
      const batchResult = await buildBatchSolTransaction(placeholderPayer, recipients);
      const serialized = batchResult.transaction
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString('base64');

      const response =
        `✅ *Batch Transaction Generated*\n\n` +
        `• *Instructions Count*: \`${batchResult.recipientCount}\`\n` +
        `• *Total Volume*: \`${batchResult.totalSol.toFixed(4)} SOL\`\n\n` +
        `*Base64 Transaction Payload (Non-Custodial):*\n` +
        `\`\`\`\n${serialized.slice(0, 120)}...\n\`\`\`\n\n` +
        `_Copy the payload into your multisig/wallet or inspect it in Solana Playground._`;

      ctx.session.step = 'idle';
      ctx.session.pendingBatch = null;

      await ctx.reply(response, {
        parse_mode: 'Markdown',
        reply_markup: mainMenuKeyboard
      });
    } catch (err) {
      await ctx.reply(`❌ Failed to compile transaction: ${err.message}`);
    }
  });

  // Action: Batch Cancel
  bot.callbackQuery('batch_cancel', async (ctx) => {
    ctx.session.step = 'idle';
    ctx.session.pendingBatch = null;
    await ctx.answerCallbackQuery({ text: 'Batch cancelled' });
    await ctx.reply('Batch cancelled.', { reply_markup: mainMenuKeyboard });
  });

  return bot;
}
