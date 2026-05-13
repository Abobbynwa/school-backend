import fs from "fs";

const file = "server.js";
let source = fs.readFileSync(file, "utf8");

const helperMarker = "// AUTO_NUMBER_HELPERS_V1";
if (!source.includes(helperMarker)) {
  const helpers = `

${helperMarker}
const currentAdmissionYear = () => new Date().getFullYear();

const nextStudentAdmissionNumber = async () => {
  const year = currentAdmissionYear();
  const prefix = `${year}/`;
  const result = await query(
    "SELECT admission_number FROM students WHERE admission_number LIKE $1 ORDER BY id DESC LIMIT 1",
    [prefix + "%"]
  );
  const last = result.rows[0]?.admission_number || "";
  const lastSerial = Number(String(last).split("/").pop() || 0);
  return `${year}/${String(lastSerial + 1).padStart(4, "0")}`;
};

const nextStaffNumber = async () => {
  const year = currentAdmissionYear();
  const prefix = `STF-${year}-`;
  const result = await query(
    "SELECT staff_id FROM staff WHERE staff_id LIKE $1 ORDER BY id DESC LIMIT 1",
    [prefix + "%"]
  );
  const last = result.rows[0]?.staff_id || "";
  const lastSerial = Number(String(last).split("-").pop() || 0);
  return `${prefix}${String(lastSerial + 1).padStart(4, "0")}`;
};
`;

  source = source.replace("const parseSubjects = (subjects) =>", `${helpers}\nconst parseSubjects = (subjects) =>`);
}

source = source.replace(
  "        admissionNumber || null,\n        name,",
  "        admissionNumber || await nextStudentAdmissionNumber(),\n        name,"
);

source = source.replace(
  "        staffId || null,\n        name,",
  "        staffId || await nextStaffNumber(),\n        name,"
);

fs.writeFileSync(file, source);
console.log("server patch runner completed: auto student admission numbers and staff IDs active");
