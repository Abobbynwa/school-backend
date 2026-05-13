import fs from "fs";

const file = "server.js";
let source = fs.readFileSync(file, "utf8");

const helpers = [
  "// AUTO_NUMBER_HELPERS_V2",
  "const currentAdmissionYear = () => new Date().getFullYear();",
  "const nextStudentAdmissionNumber = async () => {",
  "  const year = currentAdmissionYear();",
  "  const prefix = String(year) + '/';",
  "  const result = await query(\"SELECT admission_number FROM students WHERE admission_number LIKE $1 ORDER BY id DESC LIMIT 1\", [prefix + '%']);",
  "  const last = result.rows[0]?.admission_number || '';",
  "  const lastSerial = Number(String(last).split('/').pop() || 0);",
  "  return String(year) + '/' + String(lastSerial + 1).padStart(4, '0');",
  "};",
  "const nextStaffNumber = async () => {",
  "  const year = currentAdmissionYear();",
  "  const prefix = 'STF-' + String(year) + '-';",
  "  const result = await query(\"SELECT staff_id FROM staff WHERE staff_id LIKE $1 ORDER BY id DESC LIMIT 1\", [prefix + '%']);",
  "  const last = result.rows[0]?.staff_id || '';",
  "  const lastSerial = Number(String(last).split('-').pop() || 0);",
  "  return prefix + String(lastSerial + 1).padStart(4, '0');",
  "};"
].join("\n");

source = source.replace(/const helperMarker = "\/\/ AUTO_NUMBER_HELPERS_V1";[\s\S]*?source = source.replace\(\s*"const parseSubjects = \(subjects\) =>", `\$\{helpers\}\\nconst parseSubjects = \(subjects\) =>`\);\n\}/, "");
source = source.replace(/\/\/ AUTO_NUMBER_HELPERS_V1[\s\S]*?const nextStaffNumber = async \(\) => \{[\s\S]*?\};\n/, "");

if (!source.includes("// AUTO_NUMBER_HELPERS_V2")) {
  source = source.replace("const parseSubjects = (subjects) =>", helpers + "\n\nconst parseSubjects = (subjects) =>");
}

source = source.replace("admissionNumber || null,\n        name,", "admissionNumber || await nextStudentAdmissionNumber(),\n        name,");
source = source.replace("staffId || null,\n        name,", "staffId || await nextStaffNumber(),\n        name,");

source = source.replace(
  "ALTER TABLE students ADD COLUMN IF NOT EXISTS passport_url TEXT;",
  "ALTER TABLE students ADD COLUMN IF NOT EXISTS passport_url TEXT;\n    ALTER TABLE students ADD COLUMN IF NOT EXISTS passport_file_name TEXT;"
);
source = source.replace(
  "ALTER TABLE staff ADD COLUMN IF NOT EXISTS photo_url TEXT;",
  "ALTER TABLE staff ADD COLUMN IF NOT EXISTS photo_url TEXT;\n    ALTER TABLE staff ADD COLUMN IF NOT EXISTS staff_category TEXT DEFAULT 'Teaching Staff';\n    ALTER TABLE staff ADD COLUMN IF NOT EXISTS non_teaching_role TEXT;"
);
source = source.replace(
  "ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS receipt_url TEXT;",
  "ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS receipt_url TEXT;\n    ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending Verification';\n    ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS verified_by TEXT;\n    ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;"
);
source = source.replace(
  "ALTER TABLE grades ADD COLUMN IF NOT EXISTS uploaded_by TEXT DEFAULT 'Admin';",
  "ALTER TABLE grades ADD COLUMN IF NOT EXISTS uploaded_by TEXT DEFAULT 'Admin';\n    ALTER TABLE grades ADD COLUMN IF NOT EXISTS report_pdf_name TEXT;"
);

const financeRoutes = [
  "// FINANCE_AND_UPLOAD_ROUTES_V1",
  "const isFinanceText = (value='') => String(value || '').toLowerCase();",
  "const requireFinanceOrAdmin = async (req, res, next) => {",
  "  try {",
  "    if (req.user?.role === 'admin') return next();",
  "    if (req.user?.role !== 'staff') return res.status(403).json({ success:false, message:'Finance or admin access required.' });",
  "    const profile = await getStaffProfileByEmail(req.user.email);",
  "    const joined = [profile?.role, profile?.department, profile?.non_teaching_role, profile?.staff_category].map(isFinanceText).join(' ');",
  "    if (joined.includes('bursar') || joined.includes('account') || joined.includes('finance')) { req.financeProfile = profile; return next(); }",
  "    return res.status(403).json({ success:false, message:'Bursar/accountant access required.' });",
  "  } catch (error) { return res.status(500).json({ success:false, message:error.message }); }",
  "};",
  "app.get('/api/finance/fee-items', requireAuth, requireFinanceOrAdmin, async (req,res)=>{",
  "  try { const r = await query('SELECT * FROM fee_items ORDER BY created_at DESC'); res.json({success:true,count:r.rowCount,data:r.rows}); }",
  "  catch(error){ res.status(500).json({success:false,message:error.message}); }",
  "});",
  "app.post('/api/finance/fee-items', requireAuth, requireFinanceOrAdmin, async (req,res)=>{",
  "  try { const {title,className,term,amount,session,dueDate,note}=req.body; if(!title||!className||!term||amount===undefined) return res.status(400).json({success:false,message:'title, className, term and amount are required'}); const r=await query('INSERT INTO fee_items (title,class_name,term,amount,session,due_date,note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',[title,className,term,Number(amount),session||'2025/2026',dueDate||null,note||null]); res.status(201).json({success:true,message:'Fee item saved',data:r.rows[0]}); }",
  "  catch(error){ res.status(500).json({success:false,message:error.message}); }",
  "});",
  "app.get('/api/finance/payments', requireAuth, requireFinanceOrAdmin, async (req,res)=>{",
  "  try { const r=await query('SELECT p.*, s.name AS student_name, s.class_name, f.title AS fee_title, f.amount AS fee_amount, f.term FROM fee_payments p LEFT JOIN students s ON s.id=p.student_id LEFT JOIN fee_items f ON f.id=p.fee_item_id ORDER BY p.created_at DESC'); res.json({success:true,count:r.rowCount,data:r.rows}); }",
  "  catch(error){ res.status(500).json({success:false,message:error.message}); }",
  "});",
  "app.post('/api/finance/payments', requireAuth, requireFinanceOrAdmin, async (req,res)=>{",
  "  try { const {studentId,feeItemId,amountPaid,paymentMethod,reference,receiptUrl,note,status}=req.body; if(!studentId||!amountPaid) return res.status(400).json({success:false,message:'studentId and amountPaid are required'}); const verifiedBy=req.user?.name||req.user?.email||'Admin/Bursar'; const r=await query('INSERT INTO fee_payments (student_id,fee_item_id,amount_paid,payment_method,reference,receipt_url,note,status,verified_by,verified_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *',[studentId,feeItemId||null,Number(amountPaid),paymentMethod||'Cash',reference||null,receiptUrl||null,note||null,status||'Verified',verifiedBy]); res.status(201).json({success:true,message:'Payment recorded and verified',data:r.rows[0]}); }",
  "  catch(error){ res.status(500).json({success:false,message:error.message}); }",
  "});",
  "app.get('/api/finance/balances', requireAuth, requireFinanceOrAdmin, async (req,res)=>{",
  "  try { const r=await query('SELECT s.id AS student_id, s.name AS student_name, s.class_name, COALESCE(SUM(DISTINCT f.amount),0)::numeric(12,2) AS total_fee, COALESCE(SUM(p.amount_paid),0)::numeric(12,2) AS paid, (COALESCE(SUM(DISTINCT f.amount),0)-COALESCE(SUM(p.amount_paid),0))::numeric(12,2) AS balance FROM students s LEFT JOIN fee_items f ON f.class_name=s.class_name LEFT JOIN fee_payments p ON p.student_id=s.id GROUP BY s.id,s.name,s.class_name ORDER BY s.class_name,s.name'); res.json({success:true,count:r.rowCount,data:r.rows}); }",
  "  catch(error){ res.status(500).json({success:false,message:error.message}); }",
  "});"
].join("\n");

if (!source.includes("// FINANCE_AND_UPLOAD_ROUTES_V1")) {
  if (source.includes("initializeDatabase().then")) {
    source = source.replace("initializeDatabase().then", financeRoutes + "\n\ninitializeDatabase().then");
  } else if (source.includes("app.listen(")) {
    source = source.replace("app.listen(", financeRoutes + "\n\napp.listen(");
  } else {
    source += "\n" + financeRoutes + "\n";
  }
}

fs.writeFileSync(file, source);
console.log("server patch runner completed: auto IDs, finance routes, verification fields and upload metadata active");
