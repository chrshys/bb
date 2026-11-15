ALTER TABLE `queued_thread_messages` ADD `human_message_presentation` integer;--> statement-breakpoint
ALTER TABLE `queued_thread_messages` ADD `system_initiated` integer DEFAULT false NOT NULL;