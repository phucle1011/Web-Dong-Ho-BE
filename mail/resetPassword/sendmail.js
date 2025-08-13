const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Dùng trong dev, bỏ trong production
  },
});

const sendResetPassword = async (email, resetLink) => {
  const mailOptions = {
    from: `"TIMEMASTERS" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Yêu cầu đặt lại mật khẩu",
    html: `
      <table width="100%" cellpadding="0" cellspacing="0" style="font-family: 'Segoe UI', sans-serif; background-color: #f4f6f8; padding: 40px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="background-color: #073272; padding: 20px; text-align: center;">
                  <img src="https://res.cloudinary.com/disgf4yl7/image/upload/v1754403723/xpd7jmghcjjfelzbhyb0.png" alt="TIMEMASTERS" width="120" style="display: block; margin: 0 auto 10px;" />
                  <h1 style="color: #ffffff; font-size: 24px; margin: 0;">Đặt lại mật khẩu</h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding: 30px; color: #333333;">
                  <p style="font-size: 16px; margin-top: 0;">Xin chào,</p>
                  <p style="font-size: 15px; line-height: 1.6;">
                    Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.  
                    Vui lòng nhấp vào nút bên dưới để tạo mật khẩu mới:
                  </p>
                  <p style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}"
                       style="
                         background-color: #073272;
                         color: #ffffff;
                         text-decoration: none;
                         padding: 12px 28px;
                         border-radius: 4px;
                         font-size: 16px;
                         display: inline-block;
                       ">
                      Đặt lại mật khẩu
                    </a>
                  </p>
                  <p style="font-size: 14px; color: #555555;">
                    Liên kết này sẽ hết hạn sau <strong>1 giờ</strong>.  
                    Nếu bạn không yêu cầu, vui lòng bỏ qua email này.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8f9fa; padding: 20px; font-size: 12px; color: #888888; text-align: center;">
                  <p style="margin: 0;">© 2025 TIMEMASTERS.</p>
                  <p style="margin: 5px 0 0;">Email tự động, vui lòng không trả lời lại.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Lỗi gửi email đặt lại mật khẩu:", error);
    throw new Error("Không thể gửi email đặt lại mật khẩu");
  }
};




module.exports = sendResetPassword;