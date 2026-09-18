import * as readline from 'node:readline';
import { PrismaClient } from '@prisma/client';
import { AdminBootstrapService } from '../modules/admin/admin-bootstrap.service';
import { PasswordService } from '../modules/auth/password.service';

/**
 * Parses CLI flags:
 *   --email admin@example.com OR --email=admin@example.com
 *
 * NOTE: --password flag is strictly forbidden to prevent credential leakage
 * in shell history (history / bash_history) and process tables (ps / Task Manager).
 */
export function parseCliArgs(argv: string[] = process.argv.slice(2)): { email?: string } {
  const result: { email?: string } = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--email=')) {
      result.email = arg.split('=')[1];
    } else if (arg === '--email' || arg === '-e') {
      result.email = argv[++i];
    } else if (arg.startsWith('--password=') || arg === '--password' || arg === '-p') {
      throw new Error(
        'Passing passwords via command-line flags (--password) is prohibited to prevent credential leakage in shell history and process tables. Provide ADMIN_PASSWORD via environment variable or interactive prompt.'
      );
    }
  }

  return result;
}

/**
 * Prompts the operator for input in an interactive terminal.
 */
export function promptInteractive(query: string, hideInput = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (!hideInput) {
      rl.question(query, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    // Masked password prompt
    process.stdout.write(query);
    let password = '';

    const stdin = process.stdin;
    const isRaw = stdin.isRaw;
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    const onData = (char: Buffer) => {
      const str = char.toString('utf-8');
      switch (str) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.removeListener('data', onData);
          if (stdin.isTTY) {
            stdin.setRawMode(isRaw);
          }
          process.stdout.write('\n');
          rl.close();
          resolve(password.trim());
          break;
        case '\u0003': // Ctrl+C
          process.stdout.write('\n');
          process.exit(1);
          break;
        case '\u007f':
        case '\b':
          if (password.length > 0) {
            password = password.slice(0, -1);
          }
          break;
        default:
          password += str;
          break;
      }
    };

    stdin.on('data', onData);
  });
}

export async function runBootstrap(): Promise<void> {
  let cliArgs: { email?: string };
  try {
    cliArgs = parseCliArgs();
  } catch (err: any) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }

  let email = process.env.ADMIN_EMAIL || cliArgs.email;
  let password = process.env.ADMIN_PASSWORD;

  // Interactive prompts if running in TTY and values are missing
  if (process.stdin.isTTY) {
    if (!email) {
      email = await promptInteractive('Admin Email: ', false);
    }
    if (!password) {
      password = await promptInteractive('Admin Password: ', true);
    }
  }

  if (!email || !password) {
    console.error(
      '[ERROR] Missing required credentials. Provide ADMIN_EMAIL (via env or --email) and ADMIN_PASSWORD (via environment variable or interactive TTY prompt).'
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const passwordService = new PasswordService();
  const bootstrapService = new AdminBootstrapService(prisma as any, passwordService);

  try {
    const result = await bootstrapService.bootstrapAdmin({
      email,
      password,
    });

    if (result.status === 'CREATED') {
      console.log('[SUCCESS] Initial admin account created successfully.');
      console.log(`Email:   ${result.user.email}`);
      console.log(`User ID: ${result.user.id}`);
      console.log(`Role:    ${result.user.role}`);
    } else {
      console.log('[NOTICE] Admin account already exists. No changes made.');
      console.log(`Email:   ${result.user.email}`);
      console.log(`User ID: ${result.user.id}`);
      console.log(`Role:    ${result.user.role}`);
    }

    await prisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    const message = error.response?.message || error.message || String(error);
    console.error(`[ERROR] Admin bootstrap failed: ${message}`);

    if (error.response?.details && Array.isArray(error.response.details)) {
      for (const d of error.response.details) {
        console.error(`  - ${d.field}: ${d.issue}`);
      }
    }

    await prisma.$disconnect();
    process.exit(1);
  }
}

// Auto-run if executed directly as entrypoint
if (require.main === module) {
  runBootstrap();
}
