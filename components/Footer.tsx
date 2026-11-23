export function Footer() {
  const repo = process.env.NEXT_PUBLIC_REPO_URL;
  return (
    <footer className="foot">
      <span>Read-only access to Gmail and Calendar. No database, no stored email.</span>
      <span>Built with Claude Code.</span>
      {repo && <a href={repo}>Source and build log</a>}
    </footer>
  );
}
