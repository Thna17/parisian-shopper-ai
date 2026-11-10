-- Additive request deduplication. Existing records and append-only history remain untouched.
ALTER TABLE posts ADD COLUMN request_key VARCHAR(160), ADD COLUMN request_hash CHAR(64);
CREATE UNIQUE INDEX posts_creator_request_key ON posts(creator_user_id, request_key);
CREATE TABLE post_telegram_deliveries (
 outbox_event_id UUID NOT NULL REFERENCES outbox_events(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 telegram_identity_id UUID NOT NULL REFERENCES telegram_identities(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 sent_at TIMESTAMPTZ(3), PRIMARY KEY(outbox_event_id, telegram_identity_id)
);
