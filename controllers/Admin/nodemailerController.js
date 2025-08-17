const usersModel = require('../../models/usersModel');
const PromotionUserModel = require('../../models/promotionUsersModel');
const PromotionModel = require('../../models/promotionsModel');
const emailQueue = require('../../config/emailQueue');

class EmailController {
  static async sendPromotionEmails(req, res) {
    try {
      const { customerIds, promotionId, subject, content } = req.body;

      if (!promotionId) {
        return res.status(400).json({ message: 'Thiếu mã khuyến mãi (promotionId).' });
      }

      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ message: 'Vui lòng chọn khách hàng.' });
      }

      if (!subject || !content) {
        return res.status(400).json({ message: 'Tiêu đề và nội dung email không được để trống.' });
      }

      const customers = await usersModel.findAll({
        where: { id: customerIds },
        attributes: ['id', 'name', 'email'],
      });

      if (!customers.length) {
        return res.status(404).json({ message: 'Không tìm thấy khách hàng phù hợp.' });
      }

      const promotion = await PromotionModel.findByPk(promotionId);
      if (!promotion) {
        return res.status(404).json({ message: 'Không tìm thấy khuyến mãi.' });
      }

      for (const customer of customers) {
        const promotionUser = await PromotionUserModel.findOne({
          where: {
            user_id: customer.id,
            promotion_id: promotionId,
            email_sent: false,
          },
        });

        if (!promotionUser) continue;

        const value = promotion.discount_value || '';
        const type = promotion.discount_type === 'percentage' ? '%' : 'đ';
        const startDate = promotion.start_date ? new Date(promotion.start_date).toLocaleDateString('vi-VN') : 'Không rõ';
        const endDate = promotion.end_date ? new Date(promotion.end_date).toLocaleDateString('vi-VN') : 'Không rõ';
        const code = promotion.code || 'Không có mã';

        const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: auto; background-color: #ffffff; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; color: #333;">
          <div style="text-align: center; padding: 20px; background-color: #f1faff; border-bottom: 2px solid #007acc;">
            <img src="https://res.cloudinary.com/disgf4yl7/image/upload/v1754403723/xpd7jmghcjjfelzbhyb0.png" alt="Logo doanh nghiệp" style="width: 140px;" />
            <h1 style="margin: 0; font-size: 26px; color: #007acc;">TIMEMASTERS</h1>
            <p style="margin: 4px 0; font-size: 14px; color: #555;">
              Hotline: <a href="tel:+84123456789" style="color: #007acc;">+84 123 456 789</a>
            </p>
          </div>

          <div style="padding: 30px 25px;">
            <h2 style="color: #1d3557;">Xin chào <span style="color: #457b9d;">${customer.name}</span>,</h2>
            <p style="font-size: 16px;">Bạn vừa nhận được một <strong>mã giảm giá đặc biệt</strong> chỉ dành riêng cho bạn:</p>
            <ul style="list-style-type: disc; padding-left: 20px; margin-bottom: 20px;">
              <li><strong>${promotion.name}</strong> - Giảm <span style="color:#e63946; font-weight:bold;">${value}${type}</span><br/>
                <span style="font-size: 14px; color: #555;">
                  Áp dụng từ <strong>${startDate}</strong> đến <strong>${endDate}</strong><br/>
                  <span style="color: red; font-weight: bold;">Mã: ${code}</span>
                </span>
              </li>
            </ul>

            <div style="background-color: #f1faee; padding: 15px; margin-bottom: 20px;">${content}</div>

            <p style="font-size: 15px; color: #555;">
              Cảm ơn bạn đã đồng hành cùng <strong>TIMEMASTERS</strong>.
            </p>
          </div>

          <div style="text-align: center; font-size: 13px; color: #999; padding: 20px; background-color: #f8f9fa; border-top: 1px solid #ddd;">
            <p style="margin: 5px 0;">© 2025 TIMEMASTERS. Địa chỉ: Số 233, Nguyễn Văn Linh, Cần Thơ</p>
            <p style="margin: 5px 0; font-style: italic;">Email này được gửi tự động, vui lòng không trả lời lại.</p>
          </div>
        </div>`;

        // Gửi vào hàng đợi Bull
        await emailQueue.add({
          to: customer.email,
          subject,
          html: emailHtml,
          userId: customer.id,
          promotionId,
        });

        // ✅ Cập nhật trạng thái đã gửi
        await PromotionUserModel.update(
          { email_sent: true },
          {
            where: {
              user_id: customer.id,
              promotion_id: promotionId,
            },
          }
        );
      }

      return res.status(200).json({ message: 'Đã đưa email vào hàng đợi.' });
    } catch (error) {
      console.error('Lỗi gửi email:', error);
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = EmailController;
