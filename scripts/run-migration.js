const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://govfctyjammdunbxljln.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvdmZjdHlqYW1tZHVuYnhsamxuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjQyMTE1NCwiZXhwIjoyMDgxOTk3MTU0fQ.6_GS26Twr96Jj500JRrQ_l5_jXkl_-7jmV_cJRjN3uM';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('Running migration: Add activity fields to tasks table...');

  // Check if columns already exist first
  const { data: columns, error: checkError } = await supabase
    .from('tasks')
    .select('*')
    .limit(1);

  if (checkError) {
    console.error('Error checking table:', checkError);
    return;
  }

  // Try to add the columns - if they exist, this will fail gracefully
  const { error: alterError } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS is_activity BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS start_time TIME,
      ADD COLUMN IF NOT EXISTS end_time TIME;
    `
  });

  if (alterError) {
    // If RPC doesn't exist, we need to do it manually through Supabase dashboard
    console.log('Note: Cannot run ALTER TABLE directly via API.');
    console.log('Please run this SQL in Supabase Dashboard > SQL Editor:');
    console.log(`
ALTER TABLE tasks
ADD COLUMN is_activity BOOLEAN DEFAULT FALSE,
ADD COLUMN start_time TIME,
ADD COLUMN end_time TIME;
    `);
  } else {
    console.log('Migration completed successfully!');
  }
}

runMigration();
