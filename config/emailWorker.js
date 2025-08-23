require('dotenv').config();
const emailQueue = require('../config/emailQueue');
const nodemailer = require('nodemailer');
const PromotionUserModel = require('../models/promotionUsersModel'); 

emailQueue.on('completed', (job) => {
  console.log('[EMAIL] completed:', job.data.to);
});
emailQueue.on('failed', (job, err) => {
  console.error('[EMAIL] failed:', job?.data?.to, err?.message);
});

emailQueue.process(async (job) => {
  const { to, subject, html, userId, promotionId } = job.data;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.verify();

  await transporter.sendMail({
    from: `"TIMEMASTERS" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });

  await PromotionUserModel.update(
    { email_sent: true },
    { where: { user_id: userId, promotion_id: promotionId } }
  );
});
