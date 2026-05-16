-- Migration 002: Add image_url to services/experiences tables
-- Run this in Supabase SQL Editor

ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS image_url TEXT;

-- SETUP REQUERIDO en Supabase Dashboard:
-- Storage → New Bucket → nombre: "service-images" → Public: ON → Create
