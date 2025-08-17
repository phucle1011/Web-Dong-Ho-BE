const emailQueue = require('../config/emailQueue');
const nodemailer = require('nodemailer');

emailQueue.process(async (job, done) => {
  try {
    const { to, subject, html } = job.data;

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"TIMEMASTERS" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    done();
  } catch (err) {
    console.error('Email worker error:', err.message);
    done(err);
  }
});
