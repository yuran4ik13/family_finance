// Creates a login, or changes the password of an existing one.
//
//   npm run create-user -- you@example.com            (OWNER: you, the admin)
//   npm run create-user -- friend@example.com --user  (regular user)
//   npm run create-user -- demo@example.com --demo    (read-only demo login)
//
// Running it for an existing email changes the password (and logs that
// user out everywhere). The role only changes if you pass a flag.
//
// Every user only ever sees their own data, whatever the role.
//
// The password is typed in hidden. For automation you can pass it
// through the NEW_USER_PASSWORD environment variable instead.

import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

import { getCategoryMap } from '../src/categorize';
import {
  checkNewPassword,
  hashPassword,
  MIN_PASSWORD_LENGTH,
} from '../src/password';
import { prisma } from '../src/prisma';

function askHidden(question: string): Promise<string> {
  let muted = false;

  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) {
        process.stdout.write(chunk, encoding);
      }
      callback();
    },
  });

  const rl = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((arg) => !arg.startsWith('--'))?.trim().toLowerCase();
  const roleFlag = args.includes('--demo')
    ? 'DEMO'
    : args.includes('--user')
      ? 'USER'
      : args.includes('--owner')
        ? 'OWNER'
        : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run create-user -- you@example.com [--user | --demo]');
    process.exit(1);
  }

  let password = process.env.NEW_USER_PASSWORD;

  if (!password) {
    password = await askHidden(
      `Password for ${email} (min ${MIN_PASSWORD_LENGTH} chars): `,
    );
    const repeat = await askHidden('Repeat password: ');

    if (password !== repeat) {
      console.error('Passwords do not match');
      process.exit(1);
    }
  }

  const passwordProblem = checkNewPassword(password, email);

  if (passwordProblem) {
    console.error(`❌ ${passwordProblem}`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const existing = await prisma.user.findUnique({ where: { email } });

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        // Changing the password also logs out all old sessions
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
          ...(roleFlag ? { role: roleFlag } : {}),
        },
      })
    : await prisma.user.create({
        data: {
          email,
          passwordHash,
          role: roleFlag ?? 'OWNER',
          familyMembers: { create: { name: 'Me' } },
        },
      });

  await getCategoryMap(user.id);

  console.log(`✅ User ${user.email} saved (role: ${user.role})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
