-- School Management Portal Database Schema
-- Run this file inside Supabase SQL Editor before deploying the backend.

CREATE TABLE IF NOT EXISTS students (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  class_name TEXT NOT NULL,
  gender TEXT DEFAULT 'Not specified',
  parent_name TEXT DEFAULT 'Not specified',
  term TEXT DEFAULT 'Not specified',
  subjects TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  class_handled TEXT DEFAULT 'Not assigned',
  gender TEXT DEFAULT 'Not specified',
  subjects TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grades (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  grade TEXT NOT NULL,
  term TEXT DEFAULT 'Not specified',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  audience TEXT DEFAULT 'All',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  type TEXT DEFAULT 'email',
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
CREATE INDEX IF NOT EXISTS idx_staff_email ON staff(email);
CREATE INDEX IF NOT EXISTS idx_grades_student_id ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

INSERT INTO students (name, email, class_name, gender, parent_name, term, subjects)
VALUES
  ('Ada Okafor', 'ada.okafor@example.com', 'SS1 Science', 'Female', 'Mrs. Okafor', 'First Term', ARRAY['Mathematics', 'English', 'Biology', 'Chemistry', 'Physics']),
  ('Musa Ibrahim', 'musa.ibrahim@example.com', 'JSS2', 'Male', 'Mr. Ibrahim', 'First Term', ARRAY['Mathematics', 'English', 'Basic Science', 'Social Studies'])
ON CONFLICT (email) DO NOTHING;

INSERT INTO staff (name, email, role, class_handled, gender, subjects)
VALUES
  ('Mr. Chinedu Eze', 'chinedu.eze@example.com', 'Form Teacher', 'SS1 Science', 'Male', ARRAY['Physics', 'Mathematics']),
  ('Mrs. Grace Bello', 'grace.bello@example.com', 'Subject Teacher', 'JSS2', 'Female', ARRAY['English', 'Literature'])
ON CONFLICT (email) DO NOTHING;

INSERT INTO grades (student_id, subject, score, grade, term)
SELECT id, 'Mathematics', 86, 'A', 'First Term'
FROM students
WHERE email = 'ada.okafor@example.com'
AND NOT EXISTS (
  SELECT 1 FROM grades WHERE subject = 'Mathematics' AND student_id = students.id
);

INSERT INTO grades (student_id, subject, score, grade, term)
SELECT id, 'English', 74, 'B', 'First Term'
FROM students
WHERE email = 'musa.ibrahim@example.com'
AND NOT EXISTS (
  SELECT 1 FROM grades WHERE subject = 'English' AND student_id = students.id
);

INSERT INTO announcements (title, message, audience)
VALUES
  ('First Term Academic Update', 'All staff should upload continuous assessment scores before Friday.', 'Staff'),
  ('Student Portal Notice', 'Students can now view grades and profile records from the portal.', 'Students')
ON CONFLICT DO NOTHING;

INSERT INTO messages (sender, recipient, message)
VALUES
  ('Admin', 'Staff', 'Please review the uploaded student records and report missing data.'),
  ('Staff', 'Admin', 'Grade upload workflow is ready for testing.')
ON CONFLICT DO NOTHING;

INSERT INTO notifications (type, recipient, subject, message, status)
VALUES
  ('email', 'parents@example.com', 'Grade Update Available', 'A new grade record has been uploaded for review.', 'queued')
ON CONFLICT DO NOTHING;
