CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`guest` text NOT NULL,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`room` text NOT NULL,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`guests` integer NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`total` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `owner_room_dates` ON `reservations` (`owner`,`room`,`check_in`,`check_out`);