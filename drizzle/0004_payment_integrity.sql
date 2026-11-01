CREATE TRIGGER payment_booking_guard BEFORE INSERT ON payments
BEGIN
 SELECT RAISE(ABORT,'payment_booking_invalid') WHERE NOT EXISTS (SELECT 1 FROM reservations WHERE id=NEW.booking_id);
 SELECT RAISE(ABORT,'payment_booking_invalid') WHERE NEW.amount>0 AND EXISTS (SELECT 1 FROM reservations WHERE id=NEW.booking_id AND status='cancelled');
END;
--> statement-breakpoint
CREATE TRIGGER reservation_balance_guard BEFORE UPDATE ON reservations
BEGIN
 SELECT RAISE(ABORT,'booking_has_payments') WHERE NEW.status='cancelled' AND (SELECT COALESCE(SUM(amount),0) FROM payments WHERE booking_id=NEW.id)>0;
 SELECT RAISE(ABORT,'booking_has_payments') WHERE NEW.total<(SELECT COALESCE(SUM(amount),0) FROM payments WHERE booking_id=NEW.id);
END;
