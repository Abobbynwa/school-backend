import fs from "fs";

const file = "server.js";
let source = fs.readFileSync(file, "utf8");

if (!source.includes('import nodemailer from "nodemailer";')) {
  source = source.replace(
    'import jwt from "jsonwebtoken";',
    'import jwt from "jsonwebtoken";\nimport nodemailer from "nodemailer";'
  );
}

if (!source.includes("const SMTP_HOST")) {
  source = source.replace(
    'const JWT_SECRET = process.env.JWT_SECRET;',
    `const JWT_SECRET = process.env.JWT_SECRET;
const SMTP_HOST = process.env.SMTP_HOST || "smtp-relay.brevo.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SCHOOL_EMAIL = process.env.SCHOOL_EMAIL || SMTP_USER;
const SCHOOL_NAME = process.env.SCHOOL_NAME || "SchoolPortal";`
  );
}

if (!source.includes("const sendMail = async")) {
  source = source.replace(
    'const query = async (text, params = []) => pool.query(text, params);',
    `const query = async (text, params = []) => pool.query(text, params);

const mailer = SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

const sendMail = async ({ to, subject, text, html }) => {
  if (!mailer || !to) {
    console.log("Email skipped: SMTP is not configured or recipient is missing.");
    return { sent: false };
  }

  await mailer.sendMail({
    from: \`${SCHOOL_NAME} <${SMTP_USER}>\`,
    to,
    subject,
    text,
    html,
  });

  return { sent: true };
};`
  );
}

if (!source.includes("CREATE TABLE IF NOT EXISTS public_gallery")) {
  source = source.replace(
    'CREATE TABLE IF NOT EXISTS notifications (',
    `CREATE TABLE IF NOT EXISTS public_gallery (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      image_url TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public_news (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS school_profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      school_name TEXT DEFAULT 'SchoolPortal',
      about TEXT DEFAULT 'A modern academic environment for disciplined learning, digital records and student growth.',
      address TEXT DEFAULT 'Lagos, Nigeria',
      phone TEXT DEFAULT '+234 800 000 0000',
      email TEXT DEFAULT 'info@schoolportal.com',
      mission TEXT DEFAULT 'To provide structured learning, discipline, and transparent school administration.',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    INSERT INTO school_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS teacher_subject_assignments (
      id BIGSERIAL PRIMARY KEY,
      teacher_id BIGINT REFERENCES staff(id) ON DELETE CASCADE,
      teacher_email TEXT NOT NULL,
      class_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      role TEXT DEFAULT 'subject_teacher' CHECK (role IN ('subject_teacher','form_teacher')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (teacher_email, class_name, subject, role)
    );

    CREATE TABLE IF NOT EXISTS subject_score_sheets (
      id BIGSERIAL PRIMARY KEY,
      teacher_id BIGINT REFERENCES staff(id) ON DELETE SET NULL,
      teacher_email TEXT NOT NULL,
      class_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      term TEXT NOT NULL DEFAULT 'First Term',
      session TEXT NOT NULL DEFAULT '2025/2026',
      status TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','returned')),
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (teacher_email, class_name, subject, term, session)
    );

    CREATE TABLE IF NOT EXISTS subject_scores (
      id BIGSERIAL PRIMARY KEY,
      score_sheet_id BIGINT REFERENCES subject_score_sheets(id) ON DELETE CASCADE,
      student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
      ca NUMERIC(5,2) DEFAULT 0 CHECK (ca >= 0 AND ca <= 20),
      midterm NUMERIC(5,2) DEFAULT 0 CHECK (midterm >= 0 AND midterm <= 20),
      exam NUMERIC(5,2) DEFAULT 0 CHECK (exam >= 0 AND exam <= 60),
      total NUMERIC(5,2) GENERATED ALWAYS AS (ca + midterm + exam) STORED,
      grade TEXT,
      remark TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (score_sheet_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS compiled_results (
      id BIGSERIAL PRIMARY KEY,
      form_teacher_id BIGINT REFERENCES staff(id) ON DELETE SET NULL,
      form_teacher_email TEXT NOT NULL,
      student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
      class_name TEXT NOT NULL,
      term TEXT NOT NULL DEFAULT 'First Term',
      session TEXT NOT NULL DEFAULT '2025/2026',
      grand_total NUMERIC(10,2) DEFAULT 0,
      average NUMERIC(5,2) DEFAULT 0,
      position TEXT,
      result_pdf_url TEXT,
      status TEXT DEFAULT 'compiled' CHECK (status IN ('compiled','published')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (student_id, term, session)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_students_admission_number_unique ON students(admission_number) WHERE admission_number IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_staff_id_unique ON staff(staff_id) WHERE staff_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS notifications (`
  );
}

if (!source.includes('"public_gallery"')) {
  source = source.replace(
    '"assignments",',
    '"assignments",\n      "public_gallery",\n      "public_news",\n      "subject_score_sheets",\n      "subject_scores",\n      "compiled_results",'
  );
}

if (!source.includes('app.get("/api/public/site"')) {
  const publicRoutes = `
app.get("/api/public/site", async (req, res) => {
  try {
    const [profile, news, gallery, announcements] = await Promise.all([
      query("SELECT * FROM school_profile WHERE id=1"),
      query("SELECT * FROM public_news ORDER BY created_at DESC LIMIT 30"),
      query("SELECT * FROM public_gallery ORDER BY created_at DESC LIMIT 30"),
      query("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 10"),
    ]);
    res.json({ success: true, profile: profile.rows[0] || null, news: news.rows, gallery: gallery.rows, announcements: announcements.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put("/api/public/profile", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { schoolName, about, address, phone, email, mission } = req.body;
    const r = await query(
      "UPDATE school_profile SET school_name=COALESCE($1, school_name), about=COALESCE($2, about), address=COALESCE($3, address), phone=COALESCE($4, phone), email=COALESCE($5, email), mission=COALESCE($6, mission), updated_at=NOW() WHERE id=1 RETURNING *",
      [schoolName || null, about || null, address || null, phone || null, email || null, mission || null]
    );
    res.json({ success: true, message: "Public profile updated.", data: r.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/public/gallery", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, imageUrl, description } = req.body;
    if (!title || !imageUrl) return res.status(400).json({ success: false, message: "Title and image URL are required." });
    const r = await query("INSERT INTO public_gallery (title, image_url, description) VALUES ($1,$2,$3) RETURNING *", [title, imageUrl, description || null]);
    res.status(201).json({ success: true, message: "Gallery item uploaded.", data: r.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/api/public/gallery/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await query("DELETE FROM public_gallery WHERE id=$1", [req.params.id]);
    res.json({ success: true, message: "Gallery item deleted." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/public/news", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, body, imageUrl } = req.body;
    if (!title || !body) return res.status(400).json({ success: false, message: "Title and body are required." });
    const r = await query("INSERT INTO public_news (title, body, image_url) VALUES ($1,$2,$3) RETURNING *", [title, body, imageUrl || null]);
    res.status(201).json({ success: true, message: "News published.", data: r.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/api/public/news/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await query("DELETE FROM public_news WHERE id=$1", [req.params.id]);
    res.json({ success: true, message: "News deleted." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/score-sheets", requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const { className, subject, term, session, status, note, scores } = req.body;
    if (!className || !subject) return res.status(400).json({ success: false, message: "className and subject are required." });
    const staff = req.user.role === "staff" ? await getStaffProfileByEmail(req.user.email) : null;
    const teacherId = staff?.id || null;
    const teacherEmail = req.user.email;
    const sheet = await query(
      "INSERT INTO subject_score_sheets (teacher_id, teacher_email, class_name, subject, term, session, status, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (teacher_email, class_name, subject, term, session) DO UPDATE SET status=EXCLUDED.status, note=EXCLUDED.note, updated_at=NOW() RETURNING *",
      [teacherId, teacherEmail, className, subject, term || "First Term", session || "2025/2026", status || "submitted", note || null]
    );
    for (const item of scores || []) {
      const ca = Number(item.ca || 0);
      const midterm = Number(item.midterm || 0);
      const exam = Number(item.exam || 0);
      const total = ca + midterm + exam;
      const grade = calculateGrade(total);
      const remark = total >= 70 ? "Excellent" : total >= 60 ? "Very Good" : total >= 50 ? "Good" : total >= 45 ? "Pass" : total >= 40 ? "Fair" : "Fail";
      await query(
        "INSERT INTO subject_scores (score_sheet_id, student_id, ca, midterm, exam, grade, remark) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (score_sheet_id, student_id) DO UPDATE SET ca=EXCLUDED.ca, midterm=EXCLUDED.midterm, exam=EXCLUDED.exam, grade=EXCLUDED.grade, remark=EXCLUDED.remark, updated_at=NOW()",
        [sheet.rows[0].id, item.studentId, ca, midterm, exam, grade, remark]
      );
    }
    res.status(201).json({ success: true, message: "Score sheet saved.", data: sheet.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/score-sheets", requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const params = [];
    let where = "WHERE 1=1";
    if (req.user.role === "staff") {
      params.push(req.user.email);
      where += " AND (teacher_email=$1 OR class_name IN (SELECT class_handled FROM staff WHERE email=$1))";
    }
    const r = await query(
      `SELECT s.*, COALESCE(json_agg(json_build_object('student_id', sc.student_id, 'student_name', st.name, 'ca', sc.ca, 'midterm', sc.midterm, 'exam', sc.exam, 'total', sc.total, 'grade', sc.grade, 'remark', sc.remark)) FILTER (WHERE sc.id IS NOT NULL), '[]') AS scores
       FROM subject_score_sheets s
       LEFT JOIN subject_scores sc ON sc.score_sheet_id=s.id
       LEFT JOIN students st ON st.id=sc.student_id
       ${where}
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      params
    );
    res.json({ success: true, count: r.rowCount, data: r.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/results/compile", requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const { studentId, className, term, session, position, resultPdfUrl } = req.body;
    if (!studentId || !className) return res.status(400).json({ success: false, message: "studentId and className are required." });
    const sheets = await query(
      "SELECT sc.total FROM subject_scores sc JOIN subject_score_sheets ss ON ss.id=sc.score_sheet_id WHERE sc.student_id=$1 AND ss.class_name=$2 AND ss.term=$3 AND ss.session=$4",
      [studentId, className, term || "First Term", session || "2025/2026"]
    );
    const totals = sheets.rows.map((x) => Number(x.total || 0));
    const grandTotal = totals.reduce((a,b) => a + b, 0);
    const average = totals.length ? grandTotal / totals.length : 0;
    const staff = req.user.role === "staff" ? await getStaffProfileByEmail(req.user.email) : null;
    const r = await query(
      "INSERT INTO compiled_results (form_teacher_id, form_teacher_email, student_id, class_name, term, session, grand_total, average, position, result_pdf_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (student_id, term, session) DO UPDATE SET grand_total=EXCLUDED.grand_total, average=EXCLUDED.average, position=EXCLUDED.position, result_pdf_url=EXCLUDED.result_pdf_url, updated_at=NOW() RETURNING *",
      [staff?.id || null, req.user.email, studentId, className, term || "First Term", session || "2025/2026", grandTotal, average.toFixed(2), position || null, resultPdfUrl || null]
    );
    res.status(201).json({ success: true, message: "Result compiled.", data: r.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

`;
  const idx = source.lastIndexOf("initializeDatabase()");
  if (idx !== -1) {
    source = source.slice(0, idx) + publicRoutes + source.slice(idx);
  }
}

if (!source.includes("Admission confirmation email processed")) {
  const routeStart = source.indexOf('app.post("/api/admissions"');
  if (routeStart !== -1) {
    const responseStart = source.indexOf("res.status(201).json({", routeStart);
    if (responseStart !== -1) {
      const emailBlock = `
    try {
      await sendMail({
        to: parentEmail,
        subject: \`Admission Application Received - \${SCHOOL_NAME}\`,
        text: \`Dear \${parentName}, your admission application for \${studentName} into \${classApplying} has been received. We will review it and contact you.\`,
        html: \`<p>Dear <b>\${parentName}</b>,</p><p>Your admission application for <b>\${studentName}</b> into <b>\${classApplying}</b> has been received.</p><p>We will review it and contact you.</p><p>Thank you.<br/>\${SCHOOL_NAME}</p>\`,
      });

      if (SCHOOL_EMAIL && SCHOOL_EMAIL !== parentEmail) {
        await sendMail({
          to: SCHOOL_EMAIL,
          subject: \`New Admission Application - \${studentName}\`,
          text: \`New admission application. Student: \${studentName}. Class: \${classApplying}. Parent: \${parentName}. Phone: \${parentPhone}. Email: \${parentEmail || "N/A"}.\`,
        });
      }

      console.log("Admission confirmation email processed");
    } catch (mailError) {
      console.error("Admission email failed:", mailError.message);
    }

`;
      source = source.slice(0, responseStart) + emailBlock + source.slice(responseStart);
    }
  }
}

fs.writeFileSync(file, source);
console.log("server.js patched: Brevo email, public site routes, unique indexes and score sheet workflow are ready");
