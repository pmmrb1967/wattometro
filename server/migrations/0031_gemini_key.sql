-- SPDX-License-Identifier: AGPL-3.0-or-later
-- The user's Google Gemini key, sealed like the Anthropic one (key_sealed,
-- secret-box.ts). NULL: none. key_sealed may now seal '' (no Anthropic key:
-- only Gemini, or the free AI chosen).
ALTER TABLE user_ai_settings ADD COLUMN gemini_key_sealed TEXT;
