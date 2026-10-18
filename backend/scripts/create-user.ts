// Creates a login, or changes the password of an existing one.
//
//   npm run create-user -- you@example.com
//   npm run create-user -- demo@example.com --demo   (read-only demo login)
//
// There is no public "sign up" page on purpose: only you can create
// accounts, from the server's terminal.
//
// The password is typed in hidden. For automation you can pass it
// through the NEW_USER_PASSWORD environment variable instead.

import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
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
  const role = args.includes('--demo') ? 'DEMO' : 'OWNER';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run create-user -- you@example.com [--demo]');
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

  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    console.error(
      `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters long`,
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    // Changing the password also logs out all old sessions
    update: {
      passwordHash,
      role,
      tokenVersion: { increment: 1 },
    },
    create: { email, passwordHash, role },
  });

  console.log(`✅ User ${user.email} saved (role: ${user.role})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
