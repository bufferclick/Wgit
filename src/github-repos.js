import { githubUrl } from './remotes.js';
export async function listGithubRepos(token, page = 1) {
  if (!token) throw new Error('Connect GitHub to view repositories.');
  if (!Number.isInteger(page) || page < 1 || page > 100) throw new Error('Invalid page.');
  const response = await fetch(`https://api.github.com/user/repos?per_page=50&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`, { headers:{ Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json' } });
  if (!response.ok) throw new Error(response.status === 401 ? 'GitHub authorization expired. Reconnect GitHub.' : `Could not load GitHub repositories (${response.status}).`);
  const data = await response.json(); if (!Array.isArray(data)) throw new Error('Unexpected GitHub response.');
  const repos = data.map(r => ({ name:String(r.full_name), url:githubUrl(r.html_url), private:!!r.private })).filter(r => r.name.length < 250);
  repos.scopes = response.headers.get('x-oauth-scopes');
  return repos;
}
