const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  // Using Supabase pooler endpoint (transaction mode)
  const client = new Client({
    connectionString: 'postgresql://postgres.govfctyjammdunbxljln:MxoYz83dCbm%40NRG%26@aws-0-us-west-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected!');

    // Run schema migration
    console.log('\nRunning schema migration...');
    const schema = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/001_initial_schema.sql'),
      'utf8'
    );
    await client.query(schema);
    console.log('Schema migration complete!');

    // Run RLS policies
    console.log('\nRunning RLS policies migration...');
    const rls = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/002_rls_policies.sql'),
      'utf8'
    );
    await client.query(rls);
    console.log('RLS policies migration complete!');

    console.log('\n✅ All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    if (error.message.includes('already exists')) {
      console.log('\nNote: Some objects may already exist. This is okay if you ran migrations before.');
    }
  } finally {
    await client.end();
  }
}

runMigrations();
