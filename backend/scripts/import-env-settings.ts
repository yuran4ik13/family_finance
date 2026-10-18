// One-time move to the multi-user version.
// Copies MONOBANK_TOKEN, PERSONAL_TRANSFER_MARKERS and FAMILY_INCOME_MARKERS
// from .env into YOUR account in the database (the token is encrypted).
// After that you can delete those three lines from .env.
//
//   npm run import-env-settings -- you@example.com

import { encryptSecret, monobankTokenAad } from '../src/crypto';
import { prisma } from '../src/prisma';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.error('Usage: npm run import-env-settings -- you@example.com');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(`❌ No account ${email}. Create it: npm run create-user -- ${email}`);
    process.exit(1);
  }

  const token = (process.env.MONOBANK_TOKEN ?? '').trim();
  const transferMarkers = (process.env.PERSONAL_TRANSFER_MARKERS ?? '').trim();
  const familyIncomeMarkers = (process.env.FAMILY_INCOME_MARKERS ?? '').trim();

  const isPlaceholder = token === '' || token === 'your_monobank_token_here';

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(isPlaceholder
        ? {}
        : { monobankTokenEnc: encryptSecret(token, monobankTokenAad(user.id)) }),
      ...(transferMarkers ? { transferMarkers } : {}),
      ...(familyIncomeMarkers ? { familyIncomeMarkers } : {}),
    },
  });

  console.log(`✅ Saved to ${email}:`);
  console.log(`   Monobank token: ${isPlaceholder ? 'not found in .env, skipped' : 'encrypted and saved'}`);
  console.log(`   Transfer markers: ${transferMarkers ? 'saved' : 'empty, skipped'}`);
  console.log(`   Family income markers: ${familyIncomeMarkers ? 'saved' : 'empty, skipped'}`);
  console.log('Now you can remove these three lines from backend/.env.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
