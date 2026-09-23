import * as migration_20260923_164309_initial from './20260923_164309_initial';
import * as migration_20260923_182532_m1_01_payload_setup from './20260923_182532_m1_01_payload_setup';
import * as migration_20260923_185652_m1_03_translit from './20260923_185652_m1_03_translit';

export const migrations = [
  {
    up: migration_20260923_164309_initial.up,
    down: migration_20260923_164309_initial.down,
    name: '20260923_164309_initial',
  },
  {
    up: migration_20260923_182532_m1_01_payload_setup.up,
    down: migration_20260923_182532_m1_01_payload_setup.down,
    name: '20260923_182532_m1_01_payload_setup',
  },
  {
    up: migration_20260923_185652_m1_03_translit.up,
    down: migration_20260923_185652_m1_03_translit.down,
    name: '20260923_185652_m1_03_translit'
  },
];
