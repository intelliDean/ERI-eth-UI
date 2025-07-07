/*
  # Create Notifications System

  1. New Tables
    - `notifications`
      - `id` (uuid, primary key)
      - `user_address` (text, indexed)
      - `type` (text)
      - `title` (text)
      - `message` (text)
      - `item_id` (text)
      - `item_name` (text)
      - `from_address` (text, optional)
      - `to_address` (text, optional)
      - `ownership_code` (text, optional)
      - `is_read` (boolean, default false)
      - `created_at` (timestamp)
    
    - `transfer_codes`
      - `id` (uuid, primary key)
      - `item_id` (text)
      - `item_name` (text)
      - `from_address` (text)
      - `to_address` (text)
      - `ownership_code` (text, unique)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)
      - `expires_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for users to access their own data
*/

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address text NOT NULL,
  type text NOT NULL CHECK (type IN ('transfer_code_generated', 'transfer_code_revoked', 'ownership_claimed')),
  title text NOT NULL,
  message text NOT NULL,
  item_id text NOT NULL,
  item_name text NOT NULL,
  from_address text,
  to_address text,
  ownership_code text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create transfer_codes table
CREATE TABLE IF NOT EXISTS transfer_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id text NOT NULL,
  item_name text NOT NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  ownership_code text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_address ON notifications(user_address);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_transfer_codes_from_address ON transfer_codes(from_address);
CREATE INDEX IF NOT EXISTS idx_transfer_codes_to_address ON transfer_codes(to_address);
CREATE INDEX IF NOT EXISTS idx_transfer_codes_ownership_code ON transfer_codes(ownership_code);
CREATE INDEX IF NOT EXISTS idx_transfer_codes_is_active ON transfer_codes(is_active);

-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_codes ENABLE ROW LEVEL SECURITY;

-- Create policies for notifications
CREATE POLICY "Users can read their own notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (user_address = lower(auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert notifications"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own notifications"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (user_address = lower(auth.jwt() ->> 'sub'));

-- Create policies for transfer_codes
CREATE POLICY "Users can read transfer codes they're involved in"
  ON transfer_codes
  FOR SELECT
  TO authenticated
  USING (
    from_address = lower(auth.jwt() ->> 'sub') OR 
    to_address = lower(auth.jwt() ->> 'sub')
  );

CREATE POLICY "Users can insert transfer codes"
  ON transfer_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (from_address = lower(auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update their own transfer codes"
  ON transfer_codes
  FOR UPDATE
  TO authenticated
  USING (from_address = lower(auth.jwt() ->> 'sub'));

-- Allow anonymous access for notifications (since we're using wallet addresses)
CREATE POLICY "Allow anonymous read notifications"
  ON notifications
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous insert notifications"
  ON notifications
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous update notifications"
  ON notifications
  FOR UPDATE
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read transfer_codes"
  ON transfer_codes
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous insert transfer_codes"
  ON transfer_codes
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous update transfer_codes"
  ON transfer_codes
  FOR UPDATE
  TO anon
  USING (true);