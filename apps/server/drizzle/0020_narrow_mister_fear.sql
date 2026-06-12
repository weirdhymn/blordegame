CREATE INDEX IF NOT EXISTS "horses_parent_a_idx" ON "horses" USING btree ("parent_a");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "horses_parent_b_idx" ON "horses" USING btree ("parent_b");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_horse_idx" ON "market_listings" USING btree ("horse_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_from_idx" ON "trades" USING btree ("from_herd");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_to_idx" ON "trades" USING btree ("to_herd");