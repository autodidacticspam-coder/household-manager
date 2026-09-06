import fs from 'node:fs';
import { execSync } from 'node:child_process';
import ts from 'typescript';

// The linked Supabase project may host other apps. Keep only this baseline's objects.
const schema = fs.readFileSync('supabase/baseline/schema.sql', 'utf8');
const names = pattern => new Set([...schema.matchAll(pattern)].map(match => match[1]));
const allowed = {
  Tables: names(/CREATE TABLE public\.(\w+)/g),
  Views: names(/CREATE (?:MATERIALIZED )?VIEW public\.(\w+)/g),
  Functions: names(/CREATE FUNCTION public\.(\w+)/g),
  Enums: names(/CREATE TYPE public\.(\w+) AS ENUM/g),
};
const projectRef = process.argv[2];
let input;
if (projectRef === '--input') {
  const buffer = fs.readFileSync(process.argv[3]);
  input = buffer.toString(buffer[0] === 0xff ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
} else {
  if (!/^[a-z0-9]{20}$/.test(projectRef || '')) throw new Error('Pass the Supabase project reference (20 lowercase letters/digits), or --input <generated-types-file>.');
  input = execSync(`npx --yes supabase@latest gen types --project-id ${projectRef} --schema public --lang typescript`, { encoding: 'utf8', maxBuffer: 8_000_000, stdio: ['ignore', 'pipe', 'inherit'] });
}
const source = ts.createSourceFile('database.ts', input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const key = node => node.name?.text;
const edits = [];
for (const statement of source.statements) {
  if (ts.isTypeAliasDeclaration(statement) && statement.name.text === 'Database') {
    const publicSchema = statement.type.members.find(member => key(member) === 'public');
    for (const section of publicSchema.type.members) {
      const keep = allowed[key(section)];
      if (!keep) continue;
      for (const member of section.type.members) if (member.name && !keep.has(key(member))) edits.push([member.getFullStart(), member.end]);
    }
  }
}
function visit(node) {
  if (ts.isPropertyAssignment(node) && key(node) === 'Enums' && ts.isObjectLiteralExpression(node.initializer)) {
    for (const property of node.initializer.properties) {
      if (!allowed.Enums.has(key(property))) {
        let end = property.end;
        if (input[end] === ',') end++;
        edits.push([property.getFullStart(), end]);
      }
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);
for (const [start, end] of edits.sort((a, b) => b[0] - a[0])) input = input.slice(0, start) + input.slice(end);
input = input.replace(/Views:\s*\{\s*\}/, 'Views: { [_ in never]: never }');
fs.writeFileSync('types/database.ts', '// Generated from Supabase public schema; scoped to supabase/baseline/schema.sql.\n// Regenerate with npm run db:types -- <project-ref>. Do not edit manually.\n'+input);
console.log(`Generated application types for ${allowed.Tables.size} tables and ${allowed.Functions.size} functions.`);
