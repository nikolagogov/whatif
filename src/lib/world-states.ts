import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

const worldStatesDir = join(
  process.cwd(),
  'src',
  'data',
  'world-states'
);

type WorldState = {
  id: string;
  worldId: string;
  time: {
    year: number;
    label: string;
  };
  description?: string;
  variables: Array<{
    key: string;
    value: unknown;
  }>;
};

let cachedWorldStates: WorldState[] | undefined;

export function getWorldStates(): WorldState[] {
  if (!cachedWorldStates) {
    cachedWorldStates = readdirSync(worldStatesDir)
      .filter((file) => file.endsWith('.yaml'))
      .map(
        (file) =>
          YAML.parse(
            readFileSync(join(worldStatesDir, file), 'utf8')
          ) as WorldState
      );
  }

  return cachedWorldStates;
}