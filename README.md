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

Type `help` in the terminal for the supported commands. Wgit is not a full shell: network/remote operations, arbitrary shell commands, symlinks, and many Git options are not currently supported. Switching branches is blocked when the working tree has changes. Keep backups of important projects.

Build the static site with `npm run build`; deploy the generated `dist` directory to a static host such as Cloudflare Pages.

Run the filesystem and repository tests with `npm test`. For the browser workflow test, build and start the preview (`npm run build && npm run preview`), then run `WGit_CHROME_PATH=/path/to/chromium npm run test:browser`. The browser test uses an origin-private filesystem handle in place of an interactive local folder picker.
