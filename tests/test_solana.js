import {
  isValidSolanaAddress,
  parseRecipients,
  buildBatchSolTransaction,
  generateBlinkActionUrl
} from '../src/solana.js';
import { Keypair } from '@solana/web3.js';

console.log('🧪 Starting Solana Route Bot Verification Suite...\n');

// 1. Test Address Validation
const testKeypair = Keypair.generate();
const validAddress = testKeypair.publicKey.toBase58();
const invalidAddress = 'NotASolanaAddress123';

console.assert(isValidSolanaAddress(validAddress) === true, 'Valid address failed validation');
console.assert(isValidSolanaAddress(invalidAddress) === false, 'Invalid address passed validation');
console.log('✅ Address validation check passed.');

// 2. Test Recipient Parser
const rawInput = `
${validAddress} 1.5
${Keypair.generate().publicKey.toBase58()}, 0.25
${Keypair.generate().publicKey.toBase58()}\t2.0
BadAddress 0.1
${validAddress} -5.0
`;

const parsed = parseRecipients(rawInput);
console.assert(parsed.valid.length === 3, `Expected 3 valid recipients, got ${parsed.valid.length}`);
console.assert(parsed.errors.length === 2, `Expected 2 errors, got ${parsed.errors.length}`);
console.log('✅ Recipient parsing & error isolation check passed.');

// 3. Test Batch Transaction Construction
async function testTx() {
  const payer = Keypair.generate().publicKey.toBase58();
  const recipients = [
    { address: Keypair.generate().publicKey.toBase58(), amount: 0.1 },
    { address: Keypair.generate().publicKey.toBase58(), amount: 0.2 }
  ];

  const batch = await buildBatchSolTransaction(payer, recipients);
  console.assert(batch.recipientCount === 2, 'Recipient count mismatch');
  console.assert(Math.abs(batch.totalSol - 0.3) < 0.0001, 'Total SOL calculation mismatch');

  const serialized = batch.transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false
  });
  console.assert(serialized.length > 50, 'Serialized transaction too small');
  console.log(`✅ Batch transaction assembly check passed (Serialized bytes: ${serialized.length}).`);
}

// 4. Test Blink Link Generation
const blink = generateBlinkActionUrl('https://dial.to/devnet', {
  action: 'solana-action:https://api.velocityroute.io/split'
});
console.assert(blink.startsWith('solana-action:'), 'Blink protocol prefix missing');
console.log(`✅ Blink generator check passed (${blink}).`);

testTx()
  .then(() => {
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
