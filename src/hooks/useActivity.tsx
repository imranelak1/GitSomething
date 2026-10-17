import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { actionLabel, describeAction, mergeActivity, type ActivityEvent } from '@/lib/activity';

type NewActivity = Omit<ActivityEvent, 'id' | 'timestamp'>;
interface ActivityContextValue {
  activities: ActivityEvent[];
  record: (event: NewActivity) => string;
  settle: (id: string, patch: Partial<Omit<ActivityEvent, 'id' | 'timestamp'>>) => void;
}
const ActivityContext = createContext<ActivityContextValue | null>(null);

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const record = useCallback((event: NewActivity) => {
    const id = crypto.randomUUID();
    setActivities((previous) => mergeActivity(previous, { ...event, id, timestamp: Date.now() }));
    return id;
  }, []);
  const settle = useCallback(
    (id: string, patch: Partial<Omit<ActivityEvent, 'id' | 'timestamp'>>) => {
      setActivities((previous) => {
        const event = previous.find((item) => item.id === id);
        return event ? mergeActivity(previous, { ...event, ...patch }) : previous;
      });
    },
    [],
  );

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest(
        'button, a[href], summary, [role="button"], [role="checkbox"], [role="tab"], [role="menuitem"], [role="option"]',
      );
      if (
        !control ||
        control.hasAttribute('disabled') ||
        control.getAttribute('aria-disabled') === 'true'
      )
        return;
      const label = actionLabel(control);
      record({
        kind: 'interface',
        label,
        description: control.getAttribute('data-activity-description') || describeAction(label),
        lessonId: control.getAttribute('data-lesson-id') || undefined,
      });
    };
    const onChange = (event: Event) => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      record({
        kind: 'interface',
        label: actionLabel(event.target),
        description: `Selected ${event.target.selectedOptions[0]?.textContent || 'an option'}.`,
      });
    };
    // Document capture includes portal dialogs and mouse/keyboard-generated clicks.
    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onChange, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('change', onChange, true);
    };
  }, [record]);

  return (
    <ActivityContext.Provider value={{ activities, record, settle }}>
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivity() {
  const context = useContext(ActivityContext);
  if (!context) throw new Error('ActivityProvider is missing.');
  return context;
}
