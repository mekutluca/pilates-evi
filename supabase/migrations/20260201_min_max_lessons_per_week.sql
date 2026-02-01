-- Migration: Add min/max lessons per week to packages
-- This replaces the single lessons_per_week column with a flexible range

-- Add new columns
ALTER TABLE pe_packages
ADD COLUMN min_lessons_per_week INTEGER,
ADD COLUMN max_lessons_per_week INTEGER;

-- Migrate existing data (both min and max = current value)
UPDATE pe_packages
SET min_lessons_per_week = lessons_per_week,
    max_lessons_per_week = lessons_per_week
WHERE lessons_per_week IS NOT NULL;

-- Add constraints
ALTER TABLE pe_packages
ADD CONSTRAINT check_min_lessons CHECK (min_lessons_per_week >= 1 AND min_lessons_per_week <= 7),
ADD CONSTRAINT check_max_lessons CHECK (max_lessons_per_week >= 1 AND max_lessons_per_week <= 7),
ADD CONSTRAINT check_min_max CHECK (min_lessons_per_week <= max_lessons_per_week);

-- Make NOT NULL
ALTER TABLE pe_packages
ALTER COLUMN min_lessons_per_week SET NOT NULL,
ALTER COLUMN max_lessons_per_week SET NOT NULL;

-- NOTE: Drop old column AFTER code changes are verified working
-- ALTER TABLE pe_packages DROP COLUMN lessons_per_week;
