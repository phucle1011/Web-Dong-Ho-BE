// BE/utils/emailTemplate.js

const getEmailTemplate = (userName, newStatus, reason) => `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Thông báo trạng thái tài khoản</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background-color:#f4f6f8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#073272;padding:20px;text-align:center;">
              <img src="https://res.cloudinary.com/disgf4yl7/image/upload/v1754403723/xpd7jmghcjjfelzbhyb0.png"
                   alt="TIMEMASTERS" width="120" style="display:block;margin:0 auto 10px;" />
              <h1 style="color:#ffffff;font-size:24px;margin:0;">Thông báo trạng thái tài khoản</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:30px;color:#333333;line-height:1.6;">
              <p style="font-size:16px;margin-top:0;">Xin chào <strong>${userName}</strong>,</p>
              <p style="font-size:15px;">Trạng thái tài khoản của bạn đã được cập nhật như sau:</p>
              <table cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:12px;border:1px solid #ddd;"><strong>Trạng thái mới</strong></td>
                  <td style="padding:12px;border:1px solid #ddd;">${newStatus}</td>
                </tr>
                <tr>
                  <td style="padding:12px;border:1px solid #ddd;"><strong>Lý do</strong></td>
                  <td style="padding:12px;border:1px solid #ddd;">${reason}</td>
                </tr>
              </table>
              <p style="font-size:15px;color:#555555;">Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ đội ngũ hỗ trợ của chúng tôi.</p>
              <p style="font-size:15px;">Trân trọng,<br><strong>Đội ngũ TIMEMASTERS</strong></p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa;padding:20px;text-align:center;font-size:12px;color:#888888;">
              <p style="margin:0;">© ${new Date().getFullYear()} TIMEMASTERS. Địa chỉ: Số 233, Nguyễn Văn Linh, Cần Thơ</p>
              <p style="margin:5px 0 0;font-style:italic;">Email tự động, vui lòng không trả lời lại.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const getWishlistPromoTemplate = (
  userName,
  productName,
  discountValue,
  discountType,
  promoName,
  code,
  startDate,
  endDate
) => `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Thông báo khuyến mãi</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background-color:#f4f6f8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color:#073272;padding:20px;text-align:center;">
              <img src="https://res.cloudinary.com/disgf4yl7/image/upload/v1754403723/xpd7jmghcjjfelzbhyb0.png"
                   alt="TIMEMASTERS" width="120" style="display:block;margin:0 auto 10px;" />
              <h1 style="color:#ffffff;font-size:24px;margin:0;">Khuyến mãi dành cho bạn</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:30px;color:#333333;line-height:1.6;">
              <p style="font-size:16px;margin-top:0;">Xin chào <strong>${userName}</strong>,</p>
              <p style="font-size:15px;">
                Sản phẩm bạn yêu thích <strong>${productName}</strong> đang có chương trình khuyến mãi:
              </p>
              
              <table cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:12px;border:1px solid #ddd;"><strong>Tên CTKM</strong></td>
                  <td style="padding:12px;border:1px solid #ddd;">${promoName}</td>
                </tr>
                <tr>
                  <td style="padding:12px;border:1px solid #ddd;"><strong>Giảm giá</strong></td>
                  <td style="padding:12px;border:1px solid #ddd;">${discountValue}${discountType}</td>
                </tr>
                <tr>
                  <td style="padding:12px;border:1px solid #ddd;"><strong>Mã giảm giá</strong></td>
                  <td style="padding:12px;border:1px solid #ddd;">${code}</td>
                </tr>
                <tr>
                  <td style="padding:12px;border:1px solid #ddd;"><strong>Thời gian áp dụng</strong></td>
                  <td style="padding:12px;border:1px solid #ddd;">${startDate} → ${endDate}</td>
                </tr>
              </table>

              <p style="font-size:15px;color:#555555;">
                Nhanh tay tận hưởng ưu đãi trước khi chương trình kết thúc!
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa;padding:20px;text-align:center;font-size:12px;color:#888888;">
              <p style="margin:0;">© ${new Date().getFullYear()} TIMEMASTERS.</p>
              <p style="margin:5px 0 0;font-style:italic;">Email tự động, vui lòng không trả lời lại.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;


module.exports = { getEmailTemplate, getWishlistPromoTemplate };
