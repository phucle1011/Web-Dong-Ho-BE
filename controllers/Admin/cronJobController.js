const cron = require('node-cron');
const { Op } = require('sequelize');
const PromotionModel = require('../../models/promotionsModel');
const UserModel = require('../../models/usersModel');
const nodemailer = require('nodemailer');
// const getEmailTemplate = require('../../utils/emailTemplate');
const WishlistModel = require('../../models/wishlistsModel');
const transporter = require('../../config/mailer');
const { getEmailTemplate, getWishlistPromoTemplate } = require('../../utils/emailTemplate');
const PromotionProductModel = require('../../models/promotionProductsModel');
const notifyWishlistPromotions = require('../../services/notifyWishlistPromotions');
const NotificationModel = require('../../models/notificationsModel');




async function updatePromotionStatuses() {
    try {
        const now = new Date();

        const allPromotions = await PromotionModel.findAll();

        for (const promo of allPromotions) {
            let newStatus = promo.status;

            const startDate = new Date(promo.start_date).toISOString().split('T')[0];
            const endDate = new Date(promo.end_date).toISOString().split('T')[0];
            const nowDate = now.toISOString().split('T')[0];

            // const startDate = new Date(promo.start_date).toISOString(); // ví dụ: "2025-05-29T15:00:00.000Z"
            // const endDate = new Date(promo.end_date).toISOString();
            // const nowDate = new Date().toISOString();

            if (promo.status === 'inactive') {
                newStatus = 'inactive';
            } else if (promo.quantity === 0) {
                newStatus = 'exhausted';
            } else if (nowDate < startDate) {
                newStatus = 'upcoming';
            } else if (nowDate >= startDate && nowDate <= endDate) {
                newStatus = 'active';
            } else if (nowDate > endDate) {
                newStatus = 'expired';
            }

            const updateData = {};

            if (promo.status !== newStatus) {
                updateData.status = newStatus;
            }

            if (newStatus === 'exhausted' && promo.quantity !== 0) {
                updateData.quantity = 0;
            }

            if (Object.keys(updateData).length > 0) {
                await promo.update(updateData);
            }
        }
    } catch (error) {
        console.error('Lỗi khi cập nhật trạng thái khuyến mãi:', error);
    }
}

// async function deactivateStaleUsers() {
//     try {
//         const threeMonthsAgo = new Date();
//         threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

//         const usersToDeactivate = await UserModel.findAll({
//             where: {
//                 status: 'active',
//                 last_active_at: { [Op.lte]: threeMonthsAgo }
//             }
//         });

//         if (usersToDeactivate.length === 0) return;

//         const transporter = nodemailer.createTransport({
//             service: 'gmail',
//             auth: {
//                 user: process.env.EMAIL_USER,
//                 pass: process.env.EMAIL_PASS
//             }
//         });

//         for (const user of usersToDeactivate) {
//             user.status = 'inactive';
//             user.lockout_reason = 'Không hoạt động trong thời gian dài';
//             await user.save();

//             const html = getEmailTemplate(user.name, 'inactive', user.lockout_reason);
//             await transporter.sendMail({
//                 from: process.env.EMAIL_USER,
//                 to: user.email,
//                 subject: 'Tài khoản của bạn đã bị vô hiệu hóa',
//                 html
//             });
//         }

//         console.log(`Deactivated ${usersToDeactivate.length} stale users.`);
//     } catch (err) {
//         console.error('Lỗi khi deactive stale users:', err);
//     }
// }


async function updateNotificationStatuses() {
  try {
    const now = new Date();

    const expiredNotifications = await NotificationModel.findAll({
      where: {
        status: 1,
        end_date: { [Op.lt]: now },
      },
    });

    for (const notification of expiredNotifications) {
      notification.status = 0;
      await notification.save();
    }

    console.log(`Đã cập nhật ${expiredNotifications.length} notification hết hạn.`);
  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái notification:', error);
  }
}


cron.schedule('0 0 * * *', () => {
    updatePromotionStatuses();
});

cron.schedule('59 23 * * *', () => {
    updatePromotionStatuses();
});

// cron.schedule('0 0 * * *', deactivateStaleUsers);
cron.schedule('1 0 * * *', updateNotificationStatuses); 


module.exports = { updatePromotionStatuses, notifyWishlistPromotions,  updateNotificationStatuses
 };
