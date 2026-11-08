// Release order follows the merged project history, not semantic-version sorting.
export const releases = [
  { id:'v0.1.7', label:'v0.1.7', title:'A more polished Wgit', details:'A GitHub-style interface, detailed update logs, an unread indicator, and a searchable repository picker.' },
  { id:'v0.1.6', label:'v0.1.6', title:'A smoother workspace', details:'Fixed admin data deletion, improved private repository selection, kept workspace state between pages, and moved tools into a compact sidebar.' },
  { id:'v0.1.5', label:'v0.1.5', title:'A complete workspace', details:'File browsing, visual diffs and history, command completion, GitHub repository picker, commit composer, snapshots, reply notifications and guided Wgit lessons.' },
  { id:'v0.1.4', label:'v0.1.4', title:'A brighter, faster Wgit', details:'Improved admin deletion reporting, a light terminal, quicker command input, and a demo featuring Wgit’s own files.' },
  { id:'v0.1.3', label:'v0.1.3', title:'Verified community and update logs', details:'GitHub verification for posting, account bans and customizable admin data deletion, update voting, and a ¥ terminal prompt.' },
  { id:'pr-12', label:'v0.1.2', title:'Threads and profiles', details:'Nested replies, shareable discussion and settings URLs, browser-owned deletion, GitHub profiles and avatars, preloading, and a green Git terminal icon.' },
  { id:'pr-11', label:'v0.0.11', title:'Community discussions', details:'Public discussions and replies backed by Supabase, guest names, and a one-minute posting limit.' },
  { id:'pr-9', label:'v0.0.9', title:'Local conflict preference', details:'An optional setting to automatically keep local files when resolving conflicts.' },
  { id:'pr-8', label:'v0.0.8', title:'Simpler workspace', details:'Removed promotional copy and switched the browser tab and heading to the Git icon.' },
  { id:'pr-7', label:'v0.0.7', title:'Dark mode and terminal', details:'Dark mode, selectable cat output, improved terminal, clearer conflicts, and Made by Buffer.' },
  { id:'pr-6', label:'v0.0.5', title:'Quick push', details:'Added wgit push to stage, commit, safely sync and push, plus more Git commands.' },
  { id:'pr-5', label:'v0.0.4', title:'Sync and settings', details:'Guided remote sync, saved identity and token settings, terminal expansion and branch rename fixes.' },
  { id:'pr-4', label:'v0.0.3', title:'GitHub push', details:'GitHub remotes, safe HTTPS pushes, upstream configuration and a GitHub-only relay.' },
  { id:'pr-3', label:'v0.0.2', title:'Browser Git and copying', details:'Fixed browser Buffer support, automatic selection copying and Web-Git branding.' },
  { id:'pr-2', label:'v1.0.0 · fix', title:'Git initialization fix', details:'Handle Chromium blocking the optional .git/hooks directory and safely recover from empty failed initialization.' },
  { id:'pr-1', label:'v1.0.0 · initial', title:'Wgit workspace', details:'The first browser-based Git workspace, local folder access, demo mode and terminal.' },
];

// Release notes describe the behavior introduced in each update, not promises
// about integrations that were not part of that release.
const changes = {
  'v0.1.7': ['Reworked the workspace, community, settings, and tools with a consistent GitHub-style design in light and dark modes.', 'Added a blue unread marker for new releases; opening Logs marks the latest update as read on this browser.', 'Search your authorized GitHub repositories across pages, including private repositories when permission is granted.', 'Added a one-click git init suggestion when choosing a remote for an uninitialized folder.'],
  'v0.1.6': ['Fixed admin app-data deletion under Supabase’s safe-update rules; the confirmation flow and category selection remain in place.', 'Moved workspace tools into the sidebar and placed the GitHub repository selector below the terminal.', 'Retained the current folder, path, terminal history, output, and unfinished command between pages; folder permission may need reconnection.', 'Improved private-repository OAuth handling and added a notification icon.'],
  'v0.1.5': ['Added a file browser, a working-tree diff against HEAD, and a graph of local commit history.', 'Introduced Tab completion, a staged-commit composer, and an OAuth-backed GitHub repository picker.', 'Added browser-local file snapshots and an in-app view of replies to your verified discussions and comments.', 'Introduced a guided tour covering Wgit workflows, safety, Git, and GitHub.'],
  'v0.1.4': ['Changed the prompt to $ and removed the Ready indicator.', 'Made the header and terminal follow light mode and allowed users to type while commands run.', 'Replaced the starter demo with a browser-only snapshot of Wgit’s source files.', 'Added deletion counts and clearer partial-failure reporting for admin data deletion.'],
  'v0.1.3': ['Required GitHub OAuth verification for new discussions and replies; older posts are marked unverified.', 'Added BufferClick-only moderation, account bans, and category-based data deletion with three confirmations.', 'Added update logs with one changeable vote per verified account and changed the terminal prompt to ¥.'],
  'pr-12': ['Added nested discussion replies and shareable discussion and settings URLs.', 'Added GitHub profile links and avatars for eligible posts.', 'Added browser-held deletion keys: deleting a discussion removes its replies, while deleted replies retain their descendants.', 'Preloaded discussions and changed the terminal’s Git icon to green.'],
  'pr-11': ['Introduced Supabase-backed discussions and replies.', 'Added display names, a guest fallback, and a one-minute posting limit.', 'Matched the community page to Wgit and kept discussions public.'],
  'pr-9': ['Added a Settings preference to automatically keep local files or deletions during sync conflicts.', 'Linked the conflict prompt to Settings so the preference can be changed during a sync.'],
  'pr-8': ['Simplified the workspace and removed promotional copy.', 'Used the Git icon in the browser tab and workspace heading.'],
  'pr-7': ['Added dark mode and refreshed the terminal layout.', 'Added cat for readable text files and improved file-conflict messaging.', 'Added Made by Buffer to the footer.'],
  'pr-6': ['Added wgit push to stage, commit, sync, and push a folder without force.', 'Expanded the set of supported Git commands.'],
  'pr-5': ['Added guided remote synchronization and a fullscreen terminal.', 'Added saved name, email, and optional masked personal access token settings.', 'Improved branch rename behavior.'],
  'pr-4': ['Added GitHub remote configuration and HTTPS pushes from the browser.', 'Added upstream configuration and a GitHub-only relay.'],
  'pr-3': ['Fixed browser Buffer support for Git operations.', 'Added automatic copying on text selection and clarified that Wgit means Web-Git.'],
  'pr-2': ['Handled Chromium blocking the optional .git/hooks directory during initialization.', 'Allowed a safe retry when a failed initialization leaves an empty .git directory.'],
  'pr-1': ['Introduced a browser-based Git workspace with local folder access.', 'Included a browser-storage demo and a focused terminal for Git commands.']
};
for (const release of releases) release.changes = changes[release.id] || [];
