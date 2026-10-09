-- One shared studio calendar: no two confirmed consultations may overlap in time,
-- whichever designer they are assigned to. A site visit's end_at includes its travel buffer.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (tstzrange("start_at", "end_at", '[)') WITH &&)
  WHERE ("status" = 'confirmed');
