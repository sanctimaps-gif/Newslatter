-- SanctiMaps Newsletter Studio — schéma initial
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         CITEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','editor','viewer')),
  totp_secret   TEXT,              -- chiffré (AES-256-GCM)
  totp_enabled  BOOLEAN NOT NULL DEFAULT false,
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,     -- sha256 du jeton de session
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token  TEXT NOT NULL,
  pending_2fa BOOLEAN NOT NULL DEFAULT false,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE password_resets (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscribers (
  id                BIGSERIAL PRIMARY KEY,
  email             CITEXT NOT NULL UNIQUE,
  first_name        TEXT,
  last_name         TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','unsubscribed','bounced','suspended')),
  source            TEXT NOT NULL DEFAULT 'formulaire',
  tags              TEXT[] NOT NULL DEFAULT '{}',
  subscribed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at      TIMESTAMPTZ,
  unsubscribed_at   TIMESTAMPTZ,
  bounce_count      INT NOT NULL DEFAULT 0,
  last_activity_at  TIMESTAMPTZ,
  anonymized_at     TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subscribers_status_idx ON subscribers(status);
CREATE INDEX subscribers_source_idx ON subscribers(source);
CREATE INDEX subscribers_created_idx ON subscribers(created_at);

CREATE TABLE confirmation_tokens (
  id            BIGSERIAL PRIMARY KEY,
  subscriber_id BIGINT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Preuves de consentement (conservées même après anonymisation de l'abonné)
CREATE TABLE consent_records (
  id            BIGSERIAL PRIMARY KEY,
  subscriber_id BIGINT REFERENCES subscribers(id) ON DELETE SET NULL,
  action        TEXT NOT NULL CHECK (action IN ('request','confirm','unsubscribe','import','admin_add','resubscribe_request')),
  consent_text  TEXT,
  source        TEXT,
  ip_truncated  TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX consent_subscriber_idx ON consent_records(subscriber_id);

-- Liste d'exclusion : empreinte de l'adresse, survit à l'anonymisation
CREATE TABLE suppressions (
  id          BIGSERIAL PRIMARY KEY,
  email_hash  TEXT NOT NULL UNIQUE,
  reason      TEXT NOT NULL CHECK (reason IN ('unsubscribe','hard_bounce','complaint','manual','erasure')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE newsletter_templates (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'personnalise',
  is_system   BOOLEAN NOT NULL DEFAULT false,
  design      JSONB NOT NULL,       -- { settings, blocks[] }
  created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une « newsletter » est le contenu ; une « campagne » est son envoi.
CREATE TABLE newsletters (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  design      JSONB NOT NULL,
  template_id BIGINT REFERENCES newsletter_templates(id) ON DELETE SET NULL,
  created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Blocs normalisés (copie dénormalisée du design pour requêtes / audit)
CREATE TABLE newsletter_blocks (
  id            BIGSERIAL PRIMARY KEY,
  newsletter_id BIGINT NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
  position      INT NOT NULL,
  block_type    TEXT NOT NULL,
  data          JSONB NOT NULL
);
CREATE INDEX newsletter_blocks_nl_idx ON newsletter_blocks(newsletter_id, position);

CREATE TABLE segments (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  rules      JSONB NOT NULL,         -- { sources?: [], tags?: [], confirmedAfter?, confirmedBefore? }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaigns (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  subject         TEXT NOT NULL,
  preheader       TEXT,
  from_name       TEXT NOT NULL,
  from_email      TEXT NOT NULL,
  reply_to        TEXT,
  newsletter_id   BIGINT REFERENCES newsletters(id) ON DELETE SET NULL,
  design          JSONB NOT NULL,     -- figé au moment de la programmation/envoi
  audience        JSONB NOT NULL DEFAULT '{"type":"all"}',
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','scheduled','queued','sending','sent','cancelled','failed','paused')),
  scheduled_at    TIMESTAMPTZ,
  timezone        TEXT NOT NULL DEFAULT 'Europe/Paris',
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  recipient_count INT,
  html_snapshot   TEXT,
  text_snapshot   TEXT,
  track_opens     BOOLEAN NOT NULL DEFAULT false,
  confirmed_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_status_idx ON campaigns(status, scheduled_at);

CREATE TABLE campaign_recipients (
  id             BIGSERIAL PRIMARY KEY,
  campaign_id    BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  subscriber_id  BIGINT REFERENCES subscribers(id) ON DELETE SET NULL,
  email          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','sending','accepted','bounced','failed','unsubscribed','skipped','uncertain')),
  attempts       INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_id     TEXT,
  last_error     TEXT,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, subscriber_id)
);
CREATE INDEX campaign_recipients_status_idx ON campaign_recipients(campaign_id, status, next_attempt_at);
CREATE INDEX campaign_recipients_msgid_idx ON campaign_recipients(message_id);

CREATE TABLE campaign_links (
  id          BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  UNIQUE (campaign_id, url)
);

CREATE TABLE campaign_events (
  id            BIGSERIAL PRIMARY KEY,
  campaign_id   BIGINT REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id  BIGINT REFERENCES campaign_recipients(id) ON DELETE SET NULL,
  subscriber_id BIGINT REFERENCES subscribers(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN ('accepted','bounce_hard','bounce_soft','complaint','click','open','unsubscribe','failed')),
  link_id       BIGINT REFERENCES campaign_links(id) ON DELETE SET NULL,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX campaign_events_campaign_idx ON campaign_events(campaign_id, event_type);
CREATE INDEX campaign_events_created_idx ON campaign_events(created_at);

-- File d'attente persistante
CREATE TABLE scheduled_jobs (
  id           BIGSERIAL PRIMARY KEY,
  job_type     TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  run_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed','cancelled')),
  attempts     INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  locked_at    TIMESTAMPTZ,
  locked_by    TEXT,
  last_error   TEXT,
  dedupe_key   TEXT UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX scheduled_jobs_ready_idx ON scheduled_jobs(status, run_at);

CREATE TABLE email_logs (
  id            BIGSERIAL PRIMARY KEY,
  kind          TEXT NOT NULL,      -- campaign, test, confirmation, welcome, admin_notification, password_reset
  to_email      TEXT NOT NULL,
  subject       TEXT,
  campaign_id   BIGINT REFERENCES campaigns(id) ON DELETE SET NULL,
  status        TEXT NOT NULL,      -- accepted, failed, bounced
  message_id    TEXT,
  smtp_response TEXT,
  error         TEXT,
  sandbox       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_logs_created_idx ON email_logs(created_at);

CREATE TABLE media_files (
  id            BIGSERIAL PRIMARY KEY,
  filename      TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INT NOT NULL,
  width         INT,
  height        INT,
  alt_text      TEXT NOT NULL DEFAULT '',
  uploaded_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE automations (
  key         TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  config      JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE automation_runs (
  id             BIGSERIAL PRIMARY KEY,
  automation_key TEXT NOT NULL REFERENCES automations(key) ON DELETE CASCADE,
  status         TEXT NOT NULL,
  detail         JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  detail     JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at);

INSERT INTO automations(key, name, description, enabled, config) VALUES
 ('welcome_email', 'E-mail de bienvenue', 'Envoie un message de bienvenue juste après la confirmation de l''inscription (message transactionnel, non publicitaire).', false,
  '{"subject":"Bienvenue dans la lettre de SanctiMaps","body":"Merci d''avoir confirmé votre inscription. Vous recevrez désormais la lettre de SanctiMaps : un saint, un lieu, une histoire."}'),
 ('admin_signup_notification', 'Notification d''inscription', 'Prévient l''administrateur par e-mail à chaque nouvelle inscription confirmée.', false, '{"to":""}'),
 ('editorial_reminder', 'Relance éditoriale', 'Rappelle à l''administrateur de préparer la prochaine lettre si aucune campagne n''est programmée dans les N jours.', false, '{"days":7,"to":""}'),
 ('inactive_subscribers', 'Abonnés inactifs', 'Signale (sans les supprimer) les abonnés confirmés sans aucun clic depuis N mois, pour décider d''une relance ou d''un nettoyage.', false, '{"months":12}'),
 ('purge_unconfirmed', 'Purge des inscriptions non confirmées', 'Supprime les inscriptions restées non confirmées après N jours (minimisation des données, RGPD).', true, '{"days":30}');
