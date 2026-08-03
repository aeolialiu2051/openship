ALTER TABLE "instance_settings" ADD COLUMN "runtime_config" jsonb DEFAULT '{}'::jsonb NOT NULL;
