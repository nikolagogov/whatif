import type { WorldStateDisplay } from '../../types/article';
import { getWorldStates, type WorldState } from '../world-states';

function formatWorldStateLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toWorldStateDisplay(states: WorldState[]): WorldStateDisplay[] {
  return [...states]
    .sort((a, b) => a.time.year - b.time.year)
    .map((state) => ({
      date: state.time.label,
      label: state.description || 'World State',
      items: state.variables.flatMap((variable) =>
        variable.value &&
        typeof variable.value === 'object' &&
        !Array.isArray(variable.value)
          ? Object.entries(variable.value as Record<string, unknown>).map(([label, value]) => ({
              label: formatWorldStateLabel(label),
              value: String(value),
            }))
          : [{ label: variable.key, value: String(variable.value) }]
      ),
    }));
}

/** Project canonical YAML World State records for one article's world. */
export function buildArticleWorldStates(worldId?: string): WorldStateDisplay[] {
  if (!worldId) return [];
  const matchingStates = getWorldStates().filter((state) => state.worldId === worldId);
  return toWorldStateDisplay(matchingStates);
}
