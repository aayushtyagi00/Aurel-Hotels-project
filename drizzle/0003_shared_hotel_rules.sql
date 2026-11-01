DROP TRIGGER IF EXISTS prevent_room_overlap_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS prevent_room_overlap_update;
--> statement-breakpoint
CREATE TRIGGER prevent_room_overlap_insert BEFORE INSERT ON reservations
WHEN NEW.status IN ('confirmed','checked-in')
BEGIN
 SELECT RAISE(ABORT,'room_unavailable') WHERE EXISTS (SELECT 1 FROM reservations WHERE room=NEW.room AND status IN ('confirmed','checked-in') AND check_in<NEW.check_out AND check_out>NEW.check_in);
 SELECT RAISE(ABORT,'room_maintenance') WHERE EXISTS (SELECT 1 FROM room_state WHERE room=NEW.room AND operational='maintenance');
END;
--> statement-breakpoint
CREATE TRIGGER prevent_room_overlap_update BEFORE UPDATE ON reservations
WHEN NEW.status IN ('confirmed','checked-in')
BEGIN
 SELECT RAISE(ABORT,'room_unavailable') WHERE EXISTS (SELECT 1 FROM reservations WHERE room=NEW.room AND id<>NEW.id AND status IN ('confirmed','checked-in') AND check_in<NEW.check_out AND check_out>NEW.check_in);
 SELECT RAISE(ABORT,'room_maintenance') WHERE (NEW.room<>OLD.room OR NEW.check_in<>OLD.check_in OR NEW.check_out<>OLD.check_out) AND EXISTS (SELECT 1 FROM room_state WHERE room=NEW.room AND operational='maintenance');
 SELECT RAISE(ABORT,'room_not_ready') WHERE NEW.status='checked-in' AND OLD.status<>'checked-in' AND EXISTS (SELECT 1 FROM room_state WHERE room=NEW.room AND (cleaning<>'clean' OR operational<>'open'));
END;
--> statement-breakpoint
CREATE TRIGGER checkout_marks_dirty AFTER UPDATE OF status ON reservations
WHEN OLD.status='checked-in' AND NEW.status='checked-out'
BEGIN
 INSERT INTO room_state (room,cleaning,operational,assigned_to,notes,updated_at) VALUES (NEW.room,'dirty','open','','',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(room) DO UPDATE SET cleaning='dirty',updated_at=excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER payment_balance_guard BEFORE INSERT ON payments
BEGIN
 SELECT RAISE(ABORT,'payment_exceeds_balance') WHERE (SELECT COALESCE(SUM(amount),0) FROM payments WHERE booking_id=NEW.booking_id)+NEW.amount>(SELECT total FROM reservations WHERE id=NEW.booking_id);
 SELECT RAISE(ABORT,'refund_exceeds_paid') WHERE (SELECT COALESCE(SUM(amount),0) FROM payments WHERE booking_id=NEW.booking_id)+NEW.amount<0;
END;