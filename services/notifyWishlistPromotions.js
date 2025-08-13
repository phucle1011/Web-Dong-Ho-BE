// services/notifyWishlistPromotions.js

const PromotionModel = require('../models/promotionsModel');
const PromotionProductModel = require('../models/promotionProductsModel');
const WishlistModel = require('../models/wishlistsModel');
const ProductVariantModel = require('../models/productVariantsModel');
const ProductModel = require('../models/productsModel');
const UserModel = require('../models/usersModel');
const transporter = require('../config/mailer');
const { Op } = require('sequelize');

async function notifyWishlistPromotions() {
  try {
    const activePromotions = await PromotionModel.findAll({
      where: {
        applicable_to: 'product',
        status: 'active',
      },
      include: [{
        model: PromotionProductModel,
        as: 'promotion_products',
        include: [{
          model: ProductVariantModel,
          as: 'variant',
          include: [{ model: ProductModel, as: 'product' }],
        }]
      }]
    });

    for (const promo of activePromotions) {
      for (const pp of promo.promotion_products) {
        const variantId = pp.product_variant_id;
        const variant = pp.variant;
        const product = variant?.product;

        // Tìm người dùng yêu thích biến thể này
        const wishlists = await WishlistModel.findAll({
          where: { product_variant_id: variantId },
          include: [{
            model: UserModel,
            as: 'user',
            attributes: ['id', 'email', 'name'],
          }]
        });

        for (const wish of wishlists) {
          const user = wish.user;
          if (!user?.email) continue;

         await transporter.sendMail({
            from: `"TIMEMASTERS" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: `Sản phẩm bạn yêu thích đang giảm giá!`,
            html: `
              <!DOCTYPE html>
              <html lang="vi">
              <head><meta charset="UTF-8"><title>Khuyến mãi dành riêng cho bạn</title></head>
              <body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background-color:#f4f6f8;">
                <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
                  <tr>
                    <td align="center">
                      <table width="600" cellpadding="0" cellspacing="0"
                            style="background-color:#ffffff;border-radius:8px;overflow:hidden;
                                    box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                          <td style="background-color:#073272;padding:20px;text-align:center;">
                            <img src="https://res.cloudinary.com/disgf4yl7/image/upload/v1754403723/xpd7jmghcjjfelzbhyb0.png"
                                alt="TIMEMASTERS" width="120"
                                style="display:block;margin:0 auto 10px;" />
                            <h1 style="color:#ffffff;font-size:24px;margin:0;">Khuyến mãi dành riêng cho bạn</h1>
                          </td>
                        </tr>

                        <!-- Body -->
                        <tr>
                          <td style="padding:30px;color:#333333;line-height:1.6;">
                            <p style="font-size:16px;margin-top:0;">
                              Xin chào <strong>${user.name || 'bạn'}</strong>,
                            </p>
                            <p style="font-size:15px;">
                              Sản phẩm bạn yêu thích đang được giảm 
                              <strong style="color:#D7263D;">
                                ${
                                  promo.discount_type === 'fixed'
                                    ? promo.discount_value.toLocaleString('vi-VN') + '₫'
                                    : promo.discount_value + '%'
                                }
                              </strong>!
                            </p>

                            <table cellpadding="0" cellspacing="0"
                                  style="margin:20px 0;width:100%;border-collapse:collapse;">
                              <tr>
                                <td style="padding:12px;border:1px solid #ddd; width:120px; text-align:center;">
                                  <img src="${product?.thumbnail || '#'}"
                                      alt="${product?.name || ''}"
                                      style="width:100px;border-radius:8px;" />
                                </td>
                                <td style="padding:12px;border:1px solid #ddd;vertical-align:top;">
                                  <h3 style="margin:0 0 8px;">${product?.name || '[Không xác định]'}</h3>
                                  <p style="margin:0 0 8px;">
                                    Thời gian: <strong>
                                      ${new Date(promo.start_date).toLocaleDateString('vi-VN')} – ${new Date(promo.end_date).toLocaleDateString('vi-VN')}
                                    </strong>
                                  </p>
                                  <p style="margin:0;">
                                    <a href="${process.env.CLIENT_URL}/product/${product?.id}"
                                      style="background-color:#073272;color:#ffffff;
                                              text-decoration:none;padding:8px 16px;
                                              border-radius:4px;display:inline-block;font-size:14px;">
                                      Xem sản phẩm
                                    </a>
                                  </p>
                                </td>
                              </tr>
                            </table>

                            <p style="font-size:14px;color:#555555;margin-top:20px;">
                              Cảm ơn bạn đã tin tưởng TIMEMASTERS.
                            </p>
                          </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                          <td style="background-color:#f8f9fa;padding:20px;
                                    text-align:center;font-size:12px;color:#888888;">
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
            `
          });
        }
      }
    }
  } catch (err) {
    console.error('Lỗi khi gửi email wishlist:', err);
  }
}

module.exports = notifyWishlistPromotions;
