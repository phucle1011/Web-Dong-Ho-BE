const PromotionModel = require('../../models/promotionsModel');
const PromotionUserModel = require('../../models/promotionUsersModel')
const { Op } = require('sequelize');
const sequelize = require('../../config/database');

class PromotionController {
    static async getActivePromotions(req, res) {
        try {
            const userId = req.userId || req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để lấy mã giảm giá' });
            }

            const { orderTotal } = req.query;
            const now = new Date();

            const total = parseFloat(orderTotal);

            if (isNaN(total) || total <= 0) {
                return res.status(400).json({ success: false, message: 'Tổng đơn hàng không hợp lệ' });
            }

            const promotions = await PromotionModel.findAll({
                where: {
                    status: 'active',
                    special_promotion: false,
                    start_date: { [Op.lte]: now },
                    end_date: { [Op.gte]: now },
                    quantity: { [Op.gt]: 0 },
                    min_price_threshold: { [Op.lte]: total }, // đơn hàng đủ điều kiện
                    applicable_to: 'order',
                },
                attributes: ['id', 'code', 'name', 'discount_type', 'discount_value', 'max_price', 'min_price_threshold', 'end_date', 'quantity']
            });

            return res.json({
                success: true,
                data: promotions
            });
        } catch (error) {
            console.error('[getActivePromotions] Lỗi:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi máy chủ khi lấy danh sách mã giảm giá'
            });
        }
    }


    static async applyDiscount(req, res) {
        try {
            let { code, orderTotal } = req.body;
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập để sử dụng mã giảm giá' });
            }

            if (!code || typeof code !== 'string' || code.trim() === '') {
                return res.status(400).json({ success: false, message: 'Mã giảm giá là bắt buộc' });
            }

            code = code.trim().toUpperCase();
            orderTotal = parseFloat(orderTotal);

            if (isNaN(orderTotal)) {
                return res.status(400).json({ success: false, message: 'Tổng đơn hàng không hợp lệ' });
            }

            const result = await sequelize.transaction(async (t) => {
                const promotion = await PromotionModel.findOne({
                    where: { code },
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });
                if (!promotion) {
                    throw { status: 404, message: 'Mã giảm giá không tồn tại' };
                }

                const now = new Date();

                if (promotion.status !== 'active') {
                    throw { status: 400, message: `Khuyến mãi đang ở trạng thái ${promotion.status}` };
                }

                if (now < promotion.start_date || now > promotion.end_date) {
                    throw { status: 400, message: 'Khuyến mãi đã hết hạn hoặc chưa bắt đầu' };
                }

                if (promotion.quantity <= 0) {
                    throw { status: 400, message: 'Khuyến mãi đã hết lượt sử dụng' };
                }

                if (orderTotal < promotion.min_price_threshold) {
                    throw {
                        status: 400,
                        message: `Đơn hàng phải tối thiểu $${promotion.min_price_threshold}`,
                    };
                }

                if (!promotion.special_promotion) {
                    throw {
                        status: 403,
                        message: 'Mã giảm giá không hợp lệ hoặc không được phép sử dụng',
                    };
                }

                const promoUser = await PromotionUserModel.findOne({
                    where: {
                        promotion_id: promotion.id,
                        user_id: userId,
                        email_sent: true,
                        used: { [Op.not]: true },
                    },
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });
                if (!promoUser) {
                    throw {
                        status: 403,
                        message: 'Bạn không được cấp mã này hoặc đã sử dụng rồi',
                    };
                }

                const discountValue = Number(promotion.discount_value);
                const maxPrice = promotion.max_price !== null ? Number(promotion.max_price) : null;

                let discountAmount = 0;

                if (promotion.discount_type === 'percentage' && !isNaN(discountValue)) {
                    discountAmount = (orderTotal * discountValue) / 100;
                } else if (promotion.discount_type === 'fixed' && !isNaN(discountValue)) {
                    discountAmount = discountValue;
                }

                if (!isNaN(maxPrice) && discountAmount > maxPrice) {
                    discountAmount = maxPrice;
                }

                if (discountAmount > orderTotal) {
                    discountAmount = orderTotal;
                }

                discountAmount = !isNaN(discountAmount) ? discountAmount : 0;

                return {
                    discountType: promotion.discount_type,
                    discountValue,
                    discountAmount: Number(discountAmount.toFixed(2)),
                    totalAfterDiscount: Number((orderTotal - discountAmount).toFixed(2)),
                    applicableTo: promotion.applicable_to || null,
                    code,
                    promotion_id: promotion.id,
                    promotion_user_id: promoUser?.id || promotion_user_id || null,

                };
            });

            return res.json({
                success: true,
                message: `Mã giảm giá ${result.code} áp dụng thành công`,
                data: result,
            });

        } catch (error) {
            console.error('[applyDiscount] Lỗi:', error);

            const status = error?.status || 500;
            const message = error?.message || 'Lỗi máy chủ khi áp dụng mã giảm giá';

            return res.status(status).json({
                success: false,
                message,
            });
        }
    }
}

module.exports = PromotionController;