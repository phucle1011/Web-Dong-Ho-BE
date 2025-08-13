const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendVerificationEmail = async (email, verificationToken) => {
    const verificationLink = `${process.env.CLIENT_URL}/auth/verify-email?token=${verificationToken}`;

    const mailOptions = {
        from: `"TIMEMASTERS" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Xác thực địa chỉ email của bạn",
        html: `
      <table width="100%" cellpadding="0" cellspacing="0" style="font-family: 'Segoe UI', sans-serif; background-color: #f4f6f8; padding: 40px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background-color: #073272; padding: 20px; text-align: center;">
                  <img src="https://res.cloudinary.com/disgf4yl7/image/upload/v1754403723/xpd7jmghcjjfelzbhyb0.png" alt="TIMEMASTERS" width="120" style="display: block; margin: 0 auto 10px;" />
                  <h1 style="color: #ffffff; font-size: 24px; margin: 0;">Xác thực Email</h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding: 30px; color: #333333;">
                  <p style="font-size: 16px; margin-top: 0;">Xin chào,</p>
                  <p style="font-size: 15px; line-height: 1.6;">
                    Cảm ơn bạn đã đăng ký tài khoản tại TIMEMASTERS.  
                    Vui lòng nhấp vào nút bên dưới để xác thực địa chỉ email của bạn:
                  </p>
                  <p style="text-align: center; margin: 30px 0;">
                    <a href="${verificationLink}"
                       style="
                         background-color: #073272;
                         color: #ffffff;
                         text-decoration: none;
                         padding: 12px 28px;
                         border-radius: 4px;
                         font-size: 16px;
                         display: inline-block;
                       ">
                      Xác thực Email
                    </a>
                  </p>
                  <p style="font-size: 14px; color: #555555;">
                    Liên kết này sẽ hết hạn sau <strong>1 giờ</strong>.  
                    Nếu liên kết đã hết hạn, bạn có thể đăng nhập và yêu cầu gửi lại email xác thực.
                  </p>
                  <p style="font-size: 14px; color: #555555; margin-top: 20px;">
                    Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8f9fa; padding: 20px; font-size: 12px; color: #888888; text-align: center;">
                  <p style="margin: 0;">© ${new Date().getFullYear()} TIMEMASTERS.</p>
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
        console.error("Lỗi gửi email xác thực:", error);
        throw new Error("Không thể gửi email xác thực");
    }
};

module.exports = sendVerificationEmail;