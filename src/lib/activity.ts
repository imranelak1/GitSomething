export interface ActivityEvent {
  id: string;
  label: string;
  description: string;
  kind: 'interface' | 'lesson' | 'command';
  timestamp: number;
  status?: 'running' | 'success' | 'error';
  output?: string;
  command?: string;
  lessonId?: string;
}

/** Logs stay in memory. Never collect input values or authentication credentials. */
export function safeActivityText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s/@]+(?::[^\s/@]*)?@/gi, 'https://[redacted]@')
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+)\b/g,
      '[credential redacted]',
    )
    .replace(/\b(authorization\s*[:=]\s*)(?:bearer|token)\s+\S+/gi, '$1[redacted]')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
}

export function mergeActivity(events: ActivityEvent[], incoming: ActivityEvent): ActivityEvent[] {
  const safe = {
    ...incoming,
    label: safeActivityText(incoming.label),
    description: safeActivityText(incoming.description),
    output: incoming.output === undefined ? undefined : safeActivityText(incoming.output),
    command: incoming.command === undefined ? undefined : safeActivityText(incoming.command),
  };
  return events.some((event) => event.id === safe.id)
    ? events.map((event) => (event.id === safe.id ? safe : event))
    : [...events, safe].slice(-200);
}

export function describeAction(label: string): string {
  if (/unstage/i.test(label))
    return 'Remove this selection from the next commit. Your edits stay in your working folder.';
  if (/stage/i.test(label))
    return 'Select changes for your next commit. Staging does not upload anything.';
  if (/commit changes/i.test(label))
    return 'Request a local checkpoint of staged changes. The Git row below reports the result.';
  if (/\bfetch\b/i.test(label))
    return 'Check the remote for new commits without changing your working files.';
  if (/\bpull\b/i.test(label))
    return 'Bring remote commits into this branch only when a safe fast-forward is possible.';
  if (/\bpush\b/i.test(label))
    return 'Upload saved commits to the remote. Uncommitted edits stay on this computer.';
  if (/inspect|diff|file|word wrap/i.test(label))
    return 'Inspect changes before choosing what to save. Display controls leave your files unchanged.';
  if (/branch|history|checkpoint/i.test(label))
    return 'Explore saved commits and branch pointers. Opening a view does not rewrite history.';
  if (/github|sign in|code|disconnect/i.test(label))
    return 'GitHub account action requested. Credentials and verification codes are excluded from this log.';
  if (/publish|repository|folder/i.test(label))
    return 'Repository workflow requested. Opening a form does not publish files; review its final action first.';
  if (/lesson|learn|guide|help|practice/i.test(label))
    return 'Open guidance for this step. Lessons explain the workflow without changing your repository.';
  if (/clear/i.test(label))
    return 'Hide the current terminal entries. This leaves repository files and Git history untouched.';
  if (/copy/i.test(label))
    return 'Copy the requested text. Check the button feedback for the clipboard result.';
  if (/command|terminal|glass box|console/i.test(label))
    return 'Terminal control requested. Supported Git commands use the same engine as workspace buttons.';
  return 'Interface action requested. Repository operations appear separately with their equivalent Git command and result.';
}

/** Derive only a control label, never a nearby text field's value. */
export function actionLabel(element: Element): string {
  const explicit =
    element.getAttribute('data-activity-label') || element.getAttribute('aria-label');
  const labelledBy = element.getAttribute('aria-labelledby');
  const referenced = labelledBy
    ?.split(/\s+/)
    .map((id) => element.ownerDocument.getElementById(id)?.textContent || '')
    .join(' ');
  return safeActivityText(
    (
      explicit ||
      referenced ||
      element.getAttribute('title') ||
      element.textContent ||
      'Activate control'
    )
      .replace(/\s+/g, ' ')
      .trim(),
  ).slice(0, 160);
}
