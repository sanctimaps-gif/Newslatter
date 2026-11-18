// Création du premier administrateur, en ligne de commande uniquement (aucune inscription publique).
// Usage : npm run admin:create -- --email vous@sanctimaps.fr --name "Votre nom"
// Le mot de passe est demandé de façon interactive, ou lu dans ADMIN_PASSWORD (jamais écrit dans le code).
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../lib/crypto.ts';
import { one, pool } from '../lib/db.ts';
import { passwordSchema } from '../routes/auth.ts';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const email = arg('email');
const name = arg('name') ?? 'Administrateur';
const role = (arg('role') ?? 'admin') as 'admin' | 'editor' | 'viewer';
if (!email) { console.error('Indiquez --email'); process.exit(1); }

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Mot de passe (12 caractères min., lettres et chiffres) : ');
  rl.close();
}
const ok = passwordSchema.safeParse(password);
if (!ok.success) { console.error(ok.error.issues[0].message); process.exit(1); }
if (await one('SELECT 1 FROM users WHERE email=$1', [email])) { console.error('Un compte existe déjà avec cette adresse.'); process.exit(1); }
await one('INSERT INTO users(email, display_name, role, password_hash) VALUES ($1,$2,$3,$4)', [email, name, role, await hashPassword(password!)]);
console.log(`✔ Compte ${role} créé : ${email}`);
await pool.end();
