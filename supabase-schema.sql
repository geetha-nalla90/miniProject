-- Supabase SQL Schema for LifeDrop (Phase 3)
-- Copy and paste this entirely into the Supabase SQL Editor and click "Run"

-- 0. Clean up existing tables and policies to allow a fresh run
DROP POLICY IF EXISTS "Allow public read/write on users" ON users;
DROP POLICY IF EXISTS "Allow public read/write on blood_banks" ON blood_banks;
DROP POLICY IF EXISTS "Allow public read/write on requests" ON requests;
DROP POLICY IF EXISTS "Allow public read/write on request_donors" ON request_donors;
DROP POLICY IF EXISTS "Allow public read/write on chats" ON chats;

DROP TABLE IF EXISTS chats CASCADE;
DROP TABLE IF EXISTS request_donors CASCADE;
DROP TABLE IF EXISTS requests CASCADE;
DROP TABLE IF EXISTS blood_banks CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Create Users Table
CREATE TABLE public.users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL,
    "bloodType" TEXT,
    city TEXT,
    age INTEGER,
    gender TEXT,
    diseases TEXT,
    lastDonationDate TEXT,
    availability TEXT DEFAULT 'Yes',
    medicalReportUrl TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 2. Create Blood Banks Table
CREATE TABLE blood_banks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    inventory JSONB DEFAULT '{}'::jsonb,
    geo_lat DOUBLE PRECISION,
    geo_lng DOUBLE PRECISION
);

-- Insert dummy hospitals with exact Lat/Lng for the Map API Integration
INSERT INTO blood_banks (id, name, location, inventory, geo_lat, geo_lng)
VALUES 
    ('bb_1', 'City General Hospital', 'City Center', '{"A+": 5, "B+": 2, "O+": 10, "AB+": 1, "A-": 0, "B-": 0, "O-": 2, "AB-": 0}'::jsonb, 19.0760, 72.8777), -- Mumbai Center
    ('bb_2', 'Red Cross Center', 'Downtown', '{"A+": 2, "B+": 5, "O+": 4, "AB+": 2, "A-": 1, "B-": 1, "O-": 0, "AB-": 0}'::jsonb, 19.1136, 72.8697); -- Mumbai Suburb

-- 3. Create Requests Table
CREATE TABLE requests (
    id TEXT PRIMARY KEY,
    seekerId TEXT REFERENCES users(id),
    bloodType TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    hospitalId TEXT REFERENCES blood_banks(id),
    location TEXT NOT NULL,
    urgency TEXT,
    status TEXT DEFAULT 'Open',
    timestamp TEXT,
    fulfilledQuantity INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Realtime for requests table (crucial for live updates!)
alter publication supabase_realtime add table requests;

-- 4. Create Request Donors Table
CREATE TABLE request_donors (
    requestId TEXT REFERENCES requests(id),
    donorId TEXT REFERENCES users(id),
    status TEXT DEFAULT 'Accepted',
    timestamp TEXT,
    PRIMARY KEY (requestId, donorId)
);

-- 5. Create Chats Table
CREATE TABLE chats (
    id SERIAL PRIMARY KEY,
    requestId TEXT REFERENCES requests(id),
    senderId TEXT REFERENCES users(id),
    text TEXT NOT NULL,
    timestamp TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Realtime for chats table
alter publication supabase_realtime add table chats;

-- Setup RLS (Row Level Security) - Allowing public access for this MVP
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read/write on users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write on blood_banks" ON blood_banks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write on requests" ON requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write on request_donors" ON request_donors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write on chats" ON chats FOR ALL USING (true) WITH CHECK (true);
