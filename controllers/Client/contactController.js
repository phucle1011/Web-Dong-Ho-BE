const nodemailer = require("nodemailer");

class ContactController {
    static async sendContactEmail(req, res) {
        const { first_name, email, subject, message } = req.body;

        if (!first_name || !email || !subject || !message) {
            return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin." });
        }

        try {
            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
            });

            const mailOptions = {
  from: `<${process.env.EMAIL_USER}>`,  
  to: process.env.EMAIL_USER, 
  replyTo: email,  
  subject: ` ${subject}`,
  html: `
    <table style="width:100%; max-width:600px; font-family: Arial, sans-serif; border:1px solid #ddd; border-radius:8px; background:#f9f9f9; padding:20px; margin:auto;">
      <tr>
        <td style="border-bottom:2px solid #3498db; padding-bottom:10px;">
          <h2 style="color:#2c3e50; margin:0;">Thông tin liên hệ từ khách hàng</h2>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;"><strong>Tên:</strong> ${first_name}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;"><strong>Email:</strong> <a href="mailto:${email}" style="color:#3498db;">${email}</a></td>
      </tr>
      <tr>
        <td style="padding:10px 0;"><strong>Chủ đề:</strong> ${subject}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;">
          <strong>Nội dung:</strong>
          <div style="background:#fff; border:1px solid #ddd; padding:15px; border-radius:6px; white-space:pre-wrap;">${message}</div>
        </td>
      </tr>
    </table>
  `
};

            await transporter.sendMail(mailOptions);

            return res.status(200).json({ message: "Gửi liên hệ thành công!" });
        } catch (error) {
            console.error("Lỗi gửi mail:", error);
            return res.status(500).json({ error: "Không thể gửi email." });
        }
    }
    
    static async sendFaqEmail(req, res) {
  const { first_name, email, message } = req.body;

  if (!first_name || !email || !message) {
    return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin." });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

   const mailOptions = {
  from: `"TimeMasters Support" <${process.env.EMAIL_USER}>`,
  to: process.env.EMAIL_USER,
  replyTo: email, 
  subject: `Câu hỏi từ khách hàng: ${first_name} - ${subject || "Không có tiêu đề"}`,
  html: `
    <table style="width:100%; max-width:600px; font-family: Arial, sans-serif; border:1px solid #ddd; border-radius:8px; background:#f9f9f9; padding:20px; margin:auto;">
      <tr>
        <td style="border-bottom:2px solid #3498db; padding-bottom:10px;">
          <h2 style="color:#2c3e50; margin:0;">Khách hàng gửi phản hồi đến TimeMasters</h2>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;">
          <strong>Tiêu đề:</strong> ${subject || "Không có tiêu đề"}
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;">
          <strong>Họ tên:</strong> ${first_name}
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;">
          <strong>Email:</strong> <a href="mailto:${email}" style="color:#3498db; text-decoration:none;">${email}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;">
          <strong>Nội dung phản hồi:</strong>
          <div style="background:#fff; border:1px solid #ddd; padding:15px; border-radius:6px; white-space:pre-wrap;">${message}</div>
        </td>
      </tr>
    </table>
  `
};


    await transporter.sendMail(mailOptions);
    return res.status(200).json({ message: "Gửi thành công từ trang FAQ!" });
  } catch (error) {
    console.error("Lỗi gửi mail FAQ:", error);
    return res.status(500).json({ error: "Không thể gửi email từ FAQ." });
  }
}

}

module.exports = ContactController;
