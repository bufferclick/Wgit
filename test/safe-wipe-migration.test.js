import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('wipe migration uses explicit non-null key predicates required by Supabase API safe-update', async () => {
  const sql=await readFile(new URL('../supabase/migrations/20261114000000_safe_wipe.sql', import.meta.url),'utf8');
  for(const [table,key] of [['public.community_posts','id'],['public.release_votes','release_id'],['public.community_bans','github_id'],['community_private.post_limits','fingerprint'],['community_private.user_limits','github_id']]) {
    assert.ok(sql.includes(`delete from ${table} where ${key} is not null`));
  }
  assert.match(sql,/security definer/i); assert.match(sql,/Invalid selection/);
});
