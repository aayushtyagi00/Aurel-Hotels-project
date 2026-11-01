CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `room_state` (
	`room` text PRIMARY KEY NOT NULL,
	`cleaning` text DEFAULT 'clean' NOT NULL,
	`operational` text DEFAULT 'open' NOT NULL,
	`rate` integer,
	`assigned_to` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff_access` (
	`email` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hotel_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`room` text NOT NULL,
	`kind` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`assigned_to` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `reservations` ADD `version` integer DEFAULT 0 NOT NULL;