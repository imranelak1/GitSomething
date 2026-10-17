import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { mergeActivity, type ActivityEvent } from '@/lib/activity';

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
    // Layout/navigation requests are not terminal events or retained telemetry.
    if (event.kind === 'interface') return '';
    const id = crypto.randomUUID();
    setActivities((previous) =>
      mergeActivity(
        event.kind === 'lesson' ? previous.filter((item) => item.kind !== 'lesson') : previous,
        { ...event, id, timestamp: Date.now() },
      ),
    );
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
