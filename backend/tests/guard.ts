// Imported FIRST by every test file: never run tests against real data
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Run tests with NODE_ENV=test (npm test does this)');
}

if (!/test/i.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('Refusing to run: DATABASE_URL must point to a *test* database');
}

export {};
