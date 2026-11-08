// GitHub username syntax, followed by the requested GitHub email domain.
export function githubUsername(email) {
  const match = /^([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)@github\.com$/i.exec(email.trim());
  return match && !match[1].includes('--') ? match[1] : null;
}
