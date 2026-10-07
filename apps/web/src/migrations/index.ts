import * as migration_20260923_164309_initial from './20260923_164309_initial';
import * as migration_20260923_182532_m1_01_payload_setup from './20260923_182532_m1_01_payload_setup';
import * as migration_20260923_190206_m1_02_content from './20260923_190206_m1_02_content';
import * as migration_20260924_081104_m2_01_scraping from './20260924_081104_m2_01_scraping';
import * as migration_20260924_095304_m2_02_item_fetch_extract from './20260924_095304_m2_02_item_fetch_extract';
import * as migration_20260924_103928_m2_04_editorial_queue from './20260924_103928_m2_04_editorial_queue';
import * as migration_20260924_105254_m2_05_api_keys_audit from './20260924_105254_m2_05_api_keys_audit';
import * as migration_20260924_113155_m2_03_dedupe_classify_cleanup from './20260924_113155_m2_03_dedupe_classify_cleanup';
import * as migration_20260924_123153_m1_07_search from './20260924_123153_m1_07_search';
import * as migration_20260924_141221_m2_07_mcp_write from './20260924_141221_m2_07_mcp_write';
import * as migration_20260924_145141_m1_03c_translit from './20260924_145141_m1_03c_translit';
import * as migration_20260924_160838_oblog_29_cyrl_redirects from './20260924_160838_oblog_29_cyrl_redirects';
import * as migration_20260925_135926_oblog_44_media_mcp from './20260925_135926_oblog_44_media_mcp';
import * as migration_20260926_164339_oblog_47_meta_image_backfill from './20260926_164339_oblog_47_meta_image_backfill';
import * as migration_20260927_074715_oblog_22_telegram_autopost from './20260927_074715_oblog_22_telegram_autopost';
import * as migration_20260927_143458_oblog_53_feed_backoff from './20260927_143458_oblog_53_feed_backoff';
import * as migration_20260927_165003_oblog_55_new_items_notify from './20260927_165003_oblog_55_new_items_notify';
import * as migration_20260928_102322_oblog_57_seo_news from './20260928_102322_oblog_57_seo_news';
import * as migration_20261001_130613_oblog_61_mcp_auto_publish from './20261001_130613_oblog_61_mcp_auto_publish';
import * as migration_20261001_190947_oblog_67_keep_latin from './20261001_190947_oblog_67_keep_latin';
import * as migration_20261002_074741_oblog_64_pending_revisions from './20261002_074741_oblog_64_pending_revisions';
import * as migration_20261002_084324_oblog_69_post_views from './20261002_084324_oblog_69_post_views';
import * as migration_20261004_065858_oblog_71_pageview_ratelimit from './20261004_065858_oblog_71_pageview_ratelimit';
import * as migration_20261007_083607_oblog_91_make_autopost from './20261007_083607_oblog_91_make_autopost';
import * as migration_20261007_140927_oblog_94_social_title from './20261007_140927_oblog_94_social_title';

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
    up: migration_20260924_095304_m2_02_item_fetch_extract.up,
    down: migration_20260924_095304_m2_02_item_fetch_extract.down,
    name: '20260924_095304_m2_02_item_fetch_extract',
  },
  {
    up: migration_20260924_103928_m2_04_editorial_queue.up,
    down: migration_20260924_103928_m2_04_editorial_queue.down,
    name: '20260924_103928_m2_04_editorial_queue',
  },
  {
    up: migration_20260924_105254_m2_05_api_keys_audit.up,
    down: migration_20260924_105254_m2_05_api_keys_audit.down,
    name: '20260924_105254_m2_05_api_keys_audit',
  },
  {
    up: migration_20260924_113155_m2_03_dedupe_classify_cleanup.up,
    down: migration_20260924_113155_m2_03_dedupe_classify_cleanup.down,
    name: '20260924_113155_m2_03_dedupe_classify_cleanup',
  },
  {
    up: migration_20260924_123153_m1_07_search.up,
    down: migration_20260924_123153_m1_07_search.down,
    name: '20260924_123153_m1_07_search',
  },
  {
    up: migration_20260924_141221_m2_07_mcp_write.up,
    down: migration_20260924_141221_m2_07_mcp_write.down,
    name: '20260924_141221_m2_07_mcp_write',
  },
  {
    up: migration_20260924_145141_m1_03c_translit.up,
    down: migration_20260924_145141_m1_03c_translit.down,
    name: '20260924_145141_m1_03c_translit',
  },
  {
    up: migration_20260924_160838_oblog_29_cyrl_redirects.up,
    down: migration_20260924_160838_oblog_29_cyrl_redirects.down,
    name: '20260924_160838_oblog_29_cyrl_redirects',
  },
  {
    up: migration_20260925_135926_oblog_44_media_mcp.up,
    down: migration_20260925_135926_oblog_44_media_mcp.down,
    name: '20260925_135926_oblog_44_media_mcp',
  },
  {
    up: migration_20260926_164339_oblog_47_meta_image_backfill.up,
    down: migration_20260926_164339_oblog_47_meta_image_backfill.down,
    name: '20260926_164339_oblog_47_meta_image_backfill',
  },
  {
    up: migration_20260927_074715_oblog_22_telegram_autopost.up,
    down: migration_20260927_074715_oblog_22_telegram_autopost.down,
    name: '20260927_074715_oblog_22_telegram_autopost',
  },
  {
    up: migration_20260927_143458_oblog_53_feed_backoff.up,
    down: migration_20260927_143458_oblog_53_feed_backoff.down,
    name: '20260927_143458_oblog_53_feed_backoff',
  },
  {
    up: migration_20260927_165003_oblog_55_new_items_notify.up,
    down: migration_20260927_165003_oblog_55_new_items_notify.down,
    name: '20260927_165003_oblog_55_new_items_notify',
  },
  {
    up: migration_20260928_102322_oblog_57_seo_news.up,
    down: migration_20260928_102322_oblog_57_seo_news.down,
    name: '20260928_102322_oblog_57_seo_news',
  },
  {
    up: migration_20261001_130613_oblog_61_mcp_auto_publish.up,
    down: migration_20261001_130613_oblog_61_mcp_auto_publish.down,
    name: '20261001_130613_oblog_61_mcp_auto_publish',
  },
  {
    up: migration_20261001_190947_oblog_67_keep_latin.up,
    down: migration_20261001_190947_oblog_67_keep_latin.down,
    name: '20261001_190947_oblog_67_keep_latin',
  },
  {
    up: migration_20261002_074741_oblog_64_pending_revisions.up,
    down: migration_20261002_074741_oblog_64_pending_revisions.down,
    name: '20261002_074741_oblog_64_pending_revisions',
  },
  {
    up: migration_20261002_084324_oblog_69_post_views.up,
    down: migration_20261002_084324_oblog_69_post_views.down,
    name: '20261002_084324_oblog_69_post_views',
  },
  {
    up: migration_20261004_065858_oblog_71_pageview_ratelimit.up,
    down: migration_20261004_065858_oblog_71_pageview_ratelimit.down,
    name: '20261004_065858_oblog_71_pageview_ratelimit',
  },
  {
    up: migration_20261007_083607_oblog_91_make_autopost.up,
    down: migration_20261007_083607_oblog_91_make_autopost.down,
    name: '20261007_083607_oblog_91_make_autopost',
  },
  {
    up: migration_20261007_140927_oblog_94_social_title.up,
    down: migration_20261007_140927_oblog_94_social_title.down,
    name: '20261007_140927_oblog_94_social_title'
  },
];
