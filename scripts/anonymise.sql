BEGIN;

-- pixels stay for the canvas and timelapse, but no longer say who placed them or which gift paid for them
UPDATE pixels SET author_id = NULL, gift_snowflake = NULL;

-- every gift names both people involved, so the whole record goes
DELETE FROM gift_log;

-- names and avatars, bans keep their own copy in banned_user_ids as the policy describes
DELETE FROM user_details;

COMMIT;
