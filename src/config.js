import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  SOLANA_NETWORK: process.env.SOLANA_NETWORK || 'devnet', // 'devnet' or 'mainnet-beta'
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  // Standard USDC Mints
  USDC_MINT_DEVNET: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  USDC_MINT_MAINNET: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // MultiHopper API Configuration
  MULTI_HOPPER_API_BASE: process.env.MULTI_HOPPER_API_BASE || 'https://api.multihopper.com/v1',
  MULTI_HOPPER_PARTNER_KEY: process.env.MULTI_HOPPER_PARTNER_KEY || '',
  // Default explorer URL
  EXPLORER_BASE: 'https://solscan.io'
};

export function getUsdcMint() {
  return CONFIG.SOLANA_NETWORK === 'mainnet-beta'
    ? CONFIG.USDC_MINT_MAINNET
    : CONFIG.USDC_MINT_DEVNET;
}
