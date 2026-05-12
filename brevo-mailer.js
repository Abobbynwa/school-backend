import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp-relay.brevo.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SCHOOL_EMAIL = process.env.SCHOOL_EMAIL || SMTP_USER;
const SCHOOL_NAME = process.env.SCHOOL_NAME || "SchoolPortal";

const transporter = SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    })
  : null;

export async function sendAdmissionConfirmation({ parentEmail, parentName, studentName, classApplying, parentPhone }) {
  if (!transporter || !parentEmail) {
    return { sent: false, reason: "SMTP credentials or parent email missing" };
  }

  await transporter.sendMail({
    from: `${SCHOOL_NAME} <${SMTP_USER}>`,
    to: parentEmail,
    subject: `Admission Application Received - ${SCHOOL_NAME}`,
    html: `
      <p>Dear <b>${parentName}</b>,</p>
      <p>Your admission application for <b>${studentName}</b> into <b>${classApplying}</b> has been received.</p>
      <p>Our admission office will review it and contact you.</p>
      <p>Thank you.<br/>${SCHOOL_NAME}</p>
    `,
    text: `Dear ${parentName}, your admission application for ${studentName} into ${classApplying} has been received. Our admission office will review it and contact you.`,
  });

  if (SCHOOL_EMAIL && SCHOOL_EMAIL !== parentEmail) {
    await transporter.sendMail({
      from: `${SCHOOL_NAME} <${SMTP_USER}>`,
      to: SCHOOL_EMAIL,
      subject: `New Admission Application - ${studentName}`,
      text: `New admission application. Student: ${studentName}. Class: ${classApplying}. Parent: ${parentName}. Phone: ${parentPhone}. Email: ${parentEmail}.`,
    });
  }

  return { sent: true };
}
