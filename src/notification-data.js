export function replyNotifications(posts, githubId) {
  const byId = new Map(posts.map(post => [post.id, post]));
  const result = [];
  for (const post of posts) {
    if (!post.parent_id || post.deleted || post.github_id === githubId) continue;
    let parent = byId.get(post.parent_id), root = null, mine = false; const visited = new Set();
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id); if (parent.github_id === githubId) mine = true;
      if (!parent.parent_id) { root = parent; break; }
      parent = byId.get(parent.parent_id);
    }
    if (mine && root) result.push({post,root});
  }
  return result.sort((a,b) => b.post.created_at.localeCompare(a.post.created_at));
}
