create or replace function public.release_vote(p_release_id text, p_github_id text, p_direction integer)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_release_id is null or p_release_id !~ '^(pr-(1|2|3|4|5|6|7|8|9|11|12)|v0\.1\.(3|4))$' or p_github_id is null or p_github_id !~ '^[0-9]{1,20}$' or p_direction is null or p_direction not in (-1, 0, 1) then raise exception 'Invalid vote'; end if;
  if p_direction = 0 then delete from public.release_votes where release_id = p_release_id and github_id = p_github_id;
  else insert into public.release_votes (release_id, github_id, direction) values(p_release_id,p_github_id,p_direction) on conflict (release_id, github_id) do update set direction = excluded.direction; end if;
end $$;
