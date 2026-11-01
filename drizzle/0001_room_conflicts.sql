CREATE TRIGGER prevent_room_overlap_insert BEFORE INSERT ON reservations
WHEN NEW.status IN ('confirmed','checked-in')
BEGIN
 SELECT RAISE(ABORT, 'room_unavailable') WHERE EXISTS (
 SELECT 1 FROM reservations WHERE owner=NEW.owner AND room=NEW.room AND status IN ('confirmed','checked-in')
 AND check_in < NEW.check_out AND check_out > NEW.check_in);
END;
--> statement-breakpoint
CREATE TRIGGER prevent_room_overlap_update BEFORE UPDATE ON reservations
WHEN NEW.status IN ('confirmed','checked-in')
BEGIN
 SELECT RAISE(ABORT, 'room_unavailable') WHERE EXISTS (
 SELECT 1 FROM reservations WHERE owner=NEW.owner AND room=NEW.room AND id<>NEW.id AND status IN ('confirmed','checked-in')
 AND check_in < NEW.check_out AND check_out > NEW.check_in);
END;