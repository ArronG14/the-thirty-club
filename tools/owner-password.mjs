import { randomBytes, scryptSync } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import readline from 'node:readline';
if (!process.stdin.isTTY) {
  console.error(
    'Run interactively in a terminal. The password will not be echoed.',
  );
  process.exit(1);
}
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdout.write('Choose an owner password (at least 16 characters): ');
let password = '';
process.stdin.on('keypress', (text, key) => {
  if (key?.ctrl && key.name === 'c') {
    process.stdin.setRawMode(false);
    process.exit(130);
  }
  if (key?.name === 'return') {
    if (password.length < 16) {
      process.stdout.write('\nUse at least 16 characters. Try again: ');
      password = '';
      return;
    }
    const salt = randomBytes(32).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    password = '';
    process.stdin.setRawMode(false);
    process.stdout.write(
      `\nSet OWNER_PASSWORD_HASH to:\nscrypt$${salt}$${hash}\n`,
    );
    process.exit(0);
  }
  if (key?.name === 'backspace') {
    password = password.slice(0, -1);
    return;
  }
  if (text && !key?.ctrl) password += text;
});
