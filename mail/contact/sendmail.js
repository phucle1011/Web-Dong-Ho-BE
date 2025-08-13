const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const mailConfig = require("../../config/mail");

const transporter = nodemailer.createTransport(mailConfig);

async function sendContactReply(email, fullName, question, reply) {
  const subject = 'Phản hồi câu hỏi từ hệ thống';

  const templatePath = path.join(__dirname, '../contact/contact.html');
  let html = fs.readFileSync(templatePath, 'utf8');
  html = html
    .replace('{{name}}', fullName)
    .replace('{{question}}', question)
    .replace('{{reply}}', reply);

  const mailOptions = {
    from: '"Hỗ trợ khách hàng" <Duyenktbpc08750@gmail.com>',
    to: email,
    subject: subject,
    html: html,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Lỗi khi gửi email phản hồi:", error);
  }
}

module.exports = sendContactReply;
