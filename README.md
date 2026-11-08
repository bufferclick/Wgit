# Wgit

Wgit (Web-Git) is an open-source, browser-based Git workspace. Open a local project folder and use a focused set of Git commands without installing Git. Git operations are powered by [isomorphic-git](https://isomorphic-git.org/) and run in your browser.

## Getting started

```sh
npm install
npm run dev
```

Open the local URL, choose **Open folder**, and run `git init`. Use **Settings** to save a default name and email for this browser; a repository’s own Git config takes precedence. Set your commit identity with `git config user.name "Your Name"` and `git config user.email "username@github.com"`, then use `git add .` and `git commit -m "First commit"`.

Local folder access requires a secure context (HTTPS or localhost) and a browser that supports the File System Access API, such as a recent Chromium-based browser. Wgit reads and writes directly in the selected folder, including its `.git` directory. The demo workspace uses browser storage instead and does not touch local files.

Some Chromium browsers block creating `.git/hooks`. Wgit skips that optional directory when initializing a repository; it does not install or run Git hooks. If a previous Wgit initialization failed and left an **empty** `.git` directory, run `git init` again. If it contains data but is incomplete, Wgit will not overwrite it; inspect or back it up with a native Git client first. Other browser restrictions and permission errors can still prevent access to a folder.

Use the theme button in the header to switch between light and dark mode; your choice is saved in this browser. Use the expand button in the terminal header for a larger terminal. Select terminal text and release to copy it; the terminal shows “Copied” when it succeeds. If clipboard access is blocked, use Ctrl+C or Cmd+C.

## Quick push

After initializing your repository and configuring `origin`, run:

```sh
wgit push main
```

This stages **all non-ignored changes in the repository**, including deletions and previously staged changes, creates a local commit named `Wgit: update project` when needed, and pushes the current local branch to the specified branch on `origin`. Review your files and `.gitignore` first: secrets that are not ignored can be included. It uses your saved commit identity and asks for GitHub authentication if none is saved. If the remote has conflicting history, it fetches and merges that history into the **current local branch**, asks you to choose a version of each conflicting file, then retries the push without force. Canceling a conflict leaves any automatic local commit in place. Network, permissions, protected-branch errors, unsafe file collisions, and other failures may still need your attention; inspect `git status` and GitHub before retrying. If you target a differently named branch, Wgit does not switch your local branch or change its upstream.

By default, Wgit asks which version to keep for each conflict. To skip those prompts, enable **Always use local for conflicts** in Settings, including directly from a conflict prompt. This applies to every repository in this browser, for both `wgit push` and `git sync`, until you turn it off. It chooses the whole local file (or local deletion), including when GitHub also changed it; after a successful push that choice replaces the GitHub version. The other version remains in Git history. Non-conflicting GitHub files are still preserved, and pushes are never forced. Wgit logs each automatic choice in the terminal.

## Push to GitHub

Create a GitHub repository, then in Wgit run:

```sh
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Replace the URL and branch with your own. On push or sync, Wgit asks in a separate password field for a GitHub fine-grained personal access token with access to that repository and **Contents: read and write** permission (some repositories may require additional permissions or organization approval). Do not put a token in a terminal command or URL. By default Wgit keeps it only for that operation and sends it through the site's GitHub-only relay to GitHub. If you explicitly save it in Settings, it persists in browser localStorage **unencrypted**; anyone with access to the browser profile, developer tools, extensions, or a compromised site can read it. The field is masked and there is no reveal control, but masking is not encryption. Use only a trusted device, and remove the token in Settings when finished. The token is not stored in Git config or terminal history. Only use a Wgit deployment you trust: its operator handles the proxied requests. `git remote -v`, `git remote get-url`, `git remote set-url` and `git remote remove` are also supported. After `-u`, plain `git push` uses the configured upstream. Pushes are not forced. If the remote has existing commits, run `git sync origin main` first (substitute your remote and branch). Sync fetches the remote history, asks you to choose the local or GitHub version of each conflicting file, and creates a merge commit containing both histories. Commit or move local changes first. After syncing, run `git push -u origin main` again. Wgit will not overwrite untracked or ignored files; unsupported file/directory conflicts, special file modes, and multiple merge bases need another Git client. Keep a backup before syncing.

The relay is a Cloudflare Pages Function in `functions/`; deploy via Pages Git integration with build output `dist`. A static-only deployment cannot push without the relay. Cloudflare request size limits, GitHub file limits, branch protection, and repository permissions still apply. Local development and Vite preview run the same relay.

Type `help` in the terminal for the supported commands, including `cat README.md` to display UTF-8 text files up to 1 MiB, `git status --short`, `git log --oneline -n 5`, `git ls-files`, `git config --get user.name`, and `git switch -c <branch>`. Wgit is not a full shell: only GitHub HTTPS push and the guided `git sync` are supported; standalone fetch, pull, clone, force push, SSH, arbitrary shell commands, symlinks, and many Git options are not currently supported. Switching branches is blocked when the working tree has changes. Keep backups of important projects.

Build the static site with `npm run build`; deploy the generated `dist` directory to a static host such as Cloudflare Pages.

Run the filesystem and repository tests with `npm test`. For the browser workflow test, build and start the preview (`npm run build && npm run preview`), then run `WGit_CHROME_PATH=/path/to/chromium npm run test:browser`. The browser test uses an origin-private filesystem handle in place of an interactive local folder picker.

Made by Buffer.

## Community discussions

Settings and `git config user.email` accept GitHub username addresses such as `BufferClick@github.com` (or an empty Settings email). An address in that format is not proof of GitHub account ownership and does not by itself guarantee that GitHub associates commits with the account. Existing repository identities are not rewritten.

Discussion pages have shareable URLs, and replies can have nested replies. Your newly created discussions and replies can be deleted only from the browser profile where they were posted: Wgit stores a private deletion key locally and sends only a hash of that key when creating a post. Clearing browser storage loses this ability; older posts created before this feature do not have deletion keys. Deleting a discussion removes its replies too; deleting a reply retains its replies with a deleted placeholder. GitHub profile links and avatars are derived from the username portion of the supplied email and are **not verified**.

The **Community** tab opens `/community`, where visitors can start discussions and reply. Posts are public. Wgit uses the saved Settings name as an unverified display name; otherwise it uses `guest - country` based on Cloudflare's approximate country, or `guest - unknown` if unavailable. No login is required, so names and locations are not proof of identity.

The public Supabase Edge Function enforces a shared 60-second interval between discussions and replies per network IP using an atomic database operation. It stores a salted hash of the IP for rate limiting, not the raw address; people sharing an IP also share the limit. This reduces spam but does not prevent evasion through different networks. Discussion content is stored in Supabase. There is no automated moderation; operators can remove abusive posts using the Supabase dashboard. Do not post sensitive information.

Public discussion data is prefetched in the workspace and cached for the browser session, then refreshed on the Community page. The deployed WgitDB project is configured in `src/community.js`. For another deployment, provision a Supabase project, apply the SQL migration in `supabase/migrations`, set a random `COMMUNITY_IP_SALT` secret in that project, and deploy `supabase/functions/community` with JWT verification disabled. The Edge Function alone uses Supabase's built-in service-role key; never put it in frontend code. The function relies on Supabase Cloud's Cloudflare-provided `cf-connecting-ip` header; missing or invalid addresses share a single rate-limit bucket. Verify this trusted-header assumption on any different hosting setup before deploying. Cloudflare Pages supplies the country through `functions/api/community-country.js`; local previews without Cloudflare fall back to unknown. Browser integration checks run with `npm run test:community` after starting the preview and setting `WGit_CHROME_PATH`.
