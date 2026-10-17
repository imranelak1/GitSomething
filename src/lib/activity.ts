export interface ActivityEvent {
  id: string;
  label: string;
  description: string;
  kind: 'interface' | 'lesson' | 'command' | 'operation';
  timestamp: number;
  status?: 'running' | 'success' | 'error';
  output?: string;
  command?: string;
  lessonId?: string;
}

/** Terminal scope is explicit: Git words in a UI label never make it an operation. */
export function isTerminalActivity(event: ActivityEvent): boolean {
  return event.kind === 'command' || event.kind === 'operation';
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
