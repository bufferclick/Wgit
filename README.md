# Wgit

Wgit (Web-Git) is an open-source, browser-based Git workspace. Open a local project folder and use a focused set of Git commands without installing Git. Git operations are powered by [isomorphic-git](https://isomorphic-git.org/) and run in your browser.

## Getting started

```sh
npm install
npm run dev
```

Open the local URL, choose **Open folder**, and run `git init`. Set your commit identity with `git config user.name "Your Name"` and `git config user.email "you@example.com"`, then use `git add .` and `git commit -m "First commit"`.

Local folder access requires a secure context (HTTPS or localhost) and a browser that supports the File System Access API, such as a recent Chromium-based browser. Wgit reads and writes directly in the selected folder, including its `.git` directory. The demo workspace uses browser storage instead and does not touch local files.

Some Chromium browsers block creating `.git/hooks`. Wgit skips that optional directory when initializing a repository; it does not install or run Git hooks. If a previous Wgit initialization failed and left an **empty** `.git` directory, run `git init` again. If it contains data but is incomplete, Wgit will not overwrite it; inspect or back it up with a native Git client first. Other browser restrictions and permission errors can still prevent access to a folder.

Select terminal text and release to copy it; the terminal shows “Copied” when it succeeds. If clipboard access is blocked, use Ctrl+C or Cmd+C.

## Push to GitHub

Create a GitHub repository, then in Wgit run:

```sh
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Replace the URL and branch with your own. On push, Wgit asks in a separate password field for a GitHub fine-grained personal access token with access to that repository and **Contents: read and write** permission (some repositories may require additional permissions or organization approval). Do not put a token in a terminal command or URL. Wgit keeps it only for that push, sends it through the site's GitHub-only relay to GitHub, and does not save it in the repository or browser storage. Only use a Wgit deployment you trust: its operator handles the proxied requests. `git remote -v`, `git remote get-url`, `git remote set-url` and `git remote remove` are also supported. After `-u`, plain `git push` uses the configured upstream. Pushes are not forced; if the remote has different history, reconcile it using another Git client.

The relay is a Cloudflare Pages Function in `functions/`; deploy via Pages Git integration with build output `dist`. A static-only deployment cannot push without the relay. Cloudflare request size limits, GitHub file limits, branch protection, and repository permissions still apply. Local development and Vite preview run the same relay.

Type `help` in the terminal for the supported commands. Wgit is not a full shell: only GitHub HTTPS pushes are supported; fetch, pull, clone, force push, SSH, arbitrary shell commands, symlinks, and many Git options are not currently supported. Switching branches is blocked when the working tree has changes. Keep backups of important projects.

Build the static site with `npm run build`; deploy the generated `dist` directory to a static host such as Cloudflare Pages.

Run the filesystem and repository tests with `npm test`. For the browser workflow test, build and start the preview (`npm run build && npm run preview`), then run `WGit_CHROME_PATH=/path/to/chromium npm run test:browser`. The browser test uses an origin-private filesystem handle in place of an interactive local folder picker.
