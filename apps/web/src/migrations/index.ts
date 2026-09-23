import * as migration_20260923_164309_initial from './20260923_164309_initial';

export const migrations = [
  {
    up: migration_20260923_164309_initial.up,
    down: migration_20260923_164309_initial.down,
    name: '20260923_164309_initial'
  },
];
