import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

// Tests use fabricated accounts inside a transaction and always roll back.
const containerIndex = process.argv.indexOf('--container');
const container = containerIndex >= 0 ? process.argv[containerIndex + 1] : null;
let client;
if (container) {
  if (!/^household-manager-schema-check-[a-z0-9-]+$/.test(container)) throw new Error('Use a dedicated household-manager-schema-check-* container.');
  const inspection = spawnSync('docker', ['inspect', container], { encoding: 'utf8' });
  const info = JSON.parse(inspection.stdout)[0];
  if (info.HostConfig.NetworkMode !== 'none') throw new Error('The test container must have networking disabled.');
} else {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error('Set TEST_DATABASE_URL for a local disposable Supabase database, or pass --container <isolated-test-container>.');
  const url = new URL(connectionString);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Database checks require a local disposable database.');
  client = new pg.Client({ connectionString });
  await client.connect();
}
const execute = async sql => {
  if (client) return client.query(sql);
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 2_000_000 });
  if (result.status !== 0) throw new Error(result.stderr);
};
try {
  if (process.argv.includes('--baseline')) {
    await execute('BEGIN;\n'+fs.readFileSync('supabase/baseline/schema.sql','utf8')+'\n'+fs.readFileSync('supabase/baseline/seed.sql','utf8')+'\nCOMMIT;');
    console.log('Fresh application baseline and defaults applied.');
  }
  const fixtures = `INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    ('00000000-0000-4000-8000-000000000001','schema-admin@example.invalid','{"full_name":"Schema administrator"}'),
    ('00000000-0000-4000-8000-000000000002','schema-employee@example.invalid','{"full_name":"Schema employee"}');
    UPDATE public.users SET role='admin' WHERE id='00000000-0000-4000-8000-000000000001';`;
  for (const file of ['task_series', 'leave_arithmetic', 'task_permissions']) {
    await execute('BEGIN;\n'+fixtures+'\n'+fs.readFileSync(`supabase/tests/${file}.sql`,'utf8')+'\nROLLBACK;');
    console.log(`${file}: passed (fixtures rolled back).`);
  }
} catch (error) {
  if (client) await client.query('ROLLBACK');
  console.error(error.message);
  process.exitCode = 1;
} finally { if (client) await client.end(); }
