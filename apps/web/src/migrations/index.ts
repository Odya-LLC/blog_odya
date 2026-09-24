import * as migration_20260923_164309_initial from './20260923_164309_initial';
import * as migration_20260923_182532_m1_01_payload_setup from './20260923_182532_m1_01_payload_setup';
import * as migration_20260923_190206_m1_02_content from './20260923_190206_m1_02_content';
import * as migration_20260924_081104_m2_01_scraping from './20260924_081104_m2_01_scraping';
import * as migration_20260924_101001_m2_04_editorial_queue from './20260924_101001_m2_04_editorial_queue';

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
    up: migration_20260923_190206_m1_02_content.up,
    down: migration_20260923_190206_m1_02_content.down,
    name: '20260923_190206_m1_02_content',
  },
  {
    up: migration_20260924_081104_m2_01_scraping.up,
    down: migration_20260924_081104_m2_01_scraping.down,
    name: '20260924_081104_m2_01_scraping',
  },
  {
    up: migration_20260924_101001_m2_04_editorial_queue.up,
    down: migration_20260924_101001_m2_04_editorial_queue.down,
    name: '20260924_101001_m2_04_editorial_queue'
  },
];
