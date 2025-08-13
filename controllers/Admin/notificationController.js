const { Op } = require('sequelize');
const Notification = require('../../models/notificationsModel');
const User = require('../../models/usersModel');
const jwt = require('jsonwebtoken');

class NotificationController {
   static async getNotifications(req, res) {
    try {
      const {
        user_id,
        type,
        read,
        keyword,
        created_from,
        created_to,
        page = 1,
        limit = 10
      } = req.query;

      const offset = (page - 1) * limit;
      const where = {};

      if (user_id) where.user_id = user_id;
      if (type) where.type = type;
      if (read === 'true') where.read_at = { [Op.not]: null };
      if (read === 'false') where.read_at = null;
      if (created_from || created_to) {
        where.created_at = {};
        if (created_from) where.created_at[Op.gte] = new Date(created_from);
        if (created_to) where.created_at[Op.lte] = new Date(created_to);
      }
      if (keyword) {
        where[Op.or] = [
          { type: { [Op.like]: `%${keyword}%` } },
          { '$data.title$': { [Op.like]: `%${keyword}%` } },
          { '$data.message$': { [Op.like]: `%${keyword}%` } }
        ];
      }

      const { count, rows } = await Notification.findAndCountAll({
        where,
        include: [
          {
            model: Promotion,
            as: 'notificationPromotion',
            attributes: ['discount_type', 'discount_value'],
          },
          {
            model: Product,
            as: 'product',
            attributes: ['name', 'thumbnail'],
            include: [
              {
                model: ProductVariant,
                as: 'variants',
                attributes: ['price', 'stock', 'sku'],
              }
            ]
          },
          {
            model: User,
            as: 'user',
            attributes: ['name', 'email'],
          },
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      const formattedNotifications = rows.map((notification) => {
        const { notificationPromotion, product, user, data } = notification;
        let discounted_price = data?.original_price || 0;

        if (notificationPromotion && data?.original_price) {
          if (notificationPromotion.discount_type === 'percentage') {
            discounted_price = data.oriNUbginal_price * (1 - notificationPromotion.discount_value / 100);
          } else if (notificationPromotion.discount_type === 'fixed') {
            discounted_price = data.original_price - notificationPromotion.discount_value;
          }
          discounted_price = Math.max(0, discounted_price).toFixed(2);
        }

        return {
          id: notification.id,
          user_id: notification.user_id,
          user_name: user?.name || data?.user_name || 'Không xác định',
          user_email: user?.email || data?.user_email || 'Không xác định',
          product_name: product?.name || data?.product_name || 'Không xác định',
          product_thumbnail: product?.thumbnail || data?.product_thumbnail || '',
          variant_name: data?.variant_name || 'Không xác định',
          variant_sku: product?.variants?.[0]?.sku || data?.variant_sku || 'Không xác định',
          original_price: data?.original_price || 0,
          discounted_price,
          title: data?.title || 'Thông báo hệ thống',
          message: data?.message || '',
          created_at: notification.created_at,
          read_at: notification.read_at,
          type: notification.type,
        };
      });

      return res.json({ total: count, notifications: formattedNotifications });
    } catch (err) {
      console.error('Lỗi lấy danh sách thông báo:', err);
      return res.status(500).json({ message: 'Lỗi lấy danh sách thông báo', error: err.message });
    }
  }


  static async getNotificationById(req, res) {
    try {
      const { id } = req.params;
      const notification = await Notification.findByPk(id, {
        include: [
          {
            model: Promotion,
            as: 'notificationPromotion',
            attributes: ['discount_type', 'discount_value'],
          },
          {
            model: Product,
            as: 'product',
            attributes: ['name', 'thumbnail'],
            include: [
              {
                model: ProductVariant,
                as: 'variants',
                attributes: ['price', 'stock', 'sku'],
              }
            ]
          },
          {
            model: User,
            as: 'user',
            attributes: ['name', 'email'],
          },
        ],
      });

      if (!notification) {
        return res.status(404).json({ message: 'Không tìm thấy thông báo' });
      }

      const { notificationPromotion, product, user, data } = notification;
      let discounted_price = data?.original_price || 0;

      if (notificationPromotion && data?.original_price) {
        if (notificationPromotion.discount_type === 'percentage') {
          discounted_price = data.original_price * (1 - notificationPromotion.discount_value / 100);
        } else if (notificationPromotion.discount_type === 'fixed') {
          discounted_price = data.original_price - notificationPromotion.discount_value;
        }
        discounted_price = Math.max(0, discounted_price).toFixed(2);
      }

      const formattedNotification = {
        id: notification.id,
        user_id: notification.user_id,
        user_name: user?.name || data?.user_name || 'Không xác định',
        user_email: user?.email || data?.user_email || 'Không xác định',
        product_name: product?.name || data?.product_name || 'Không xác định',
        product_thumbnail: product?.thumbnail || data?.product_thumbnail || '',
        variant_name: data?.variant_name || 'Không xác định',
        variant_sku: product?.variants?.[0]?.sku || data?.variant_sku || 'Không xác định',
        original_price: data?.original_price || 0,
        discounted_price,
        title: data?.title || 'Thông báo hệ thống',
        message: data?.message || '',
        created_at: notification.created_at,
        read_at: notification.read_at,
        type: notification.type,
      };

      return res.json(formattedNotification);
    } catch (err) {
      console.error('Lỗi lấy chi tiết thông báo:', err);
      return res.status(500).json({ message: 'Lỗi lấy chi tiết thông báo', error: err.message });
    }
  }

  static async createNotification(req, res) {
    try {
      const { user_ids, discount_id, type, data } = req.body;

      if (!data?.title || !data?.message) {
        return res.status(400).json({ message: 'Dữ liệu thông báo phải có title và message' });
      }

      if (Array.isArray(user_ids)) {
        const users = await User.findAll({ where: { id: user_ids } });
        if (users.length !== user_ids.length) {
          return res.status(404).json({ message: 'Một hoặc nhiều người dùng không tồn tại.' });
        }
      } else {
        const user = await User.findByPk(user_ids);
        if (!user) {
          return res.status(404).json({ message: 'Người dùng không tồn tại.' });
        }
      }

      if (discount_id) {
        const promotion = await Promotion.findByPk(discount_id);
        if (!promotion) {
          return res.status(404).json({ message: 'Khuyến mãi không tồn tại.' });
        }
      }

      if (data?.variant_id) {
        const variant = await ProductVariant.findByPk(data.variant_id);
        if (!variant) {
          return res.status(404).json({ message: 'Biến thể sản phẩm không tồn tại.' });
        }
        data.variant_sku = variant.sku; // Thêm SKU vào data
      }

      let notifications;
      if (Array.isArray(user_ids)) {
        notifications = await Promise.all(
          user_ids.map(user_id =>
            Notification.create({ user_id, discount_id, type, data, created_at: new Date() })
          )
        );
      } else {
        notifications = [
          await Notification.create({ user_id: user_ids, discount_id, type, data, created_at: new Date() })
        ];
      }

      const io = req.app.get('io');
      if (io) {
        notifications.forEach(notification => {
          io.to(notification.user_id.toString()).emit('createNotification', {
            id: notification.id,
            user_id: notification.user_id,
            type: notification.type,
            data: notification.data,
            created_at: notification.created_at,
            read_at: notification.read_at,
          });
        });
      }

      return res.status(201).json({ message: 'Tạo thông báo thành công', notifications });
    } catch (err) {
      console.error('Lỗi khi tạo thông báo:', err);
      return res.status(500).json({ message: 'Lỗi tạo thông báo', error: err.message });
    }
  }

  static async deleteNotification(req, res) {
    try {
      const { id } = req.params;
      const deleted = await Notification.destroy({ where: { id } });

      if (!deleted) {
        return res.status(404).json({ message: 'Không tìm thấy thông báo để xóa' });
      }

      return res.json({ message: 'Xóa thông báo thành công' });
    } catch (err) {
      console.error('Lỗi xóa thông báo:', err);
      return res.status(500).json({ message: 'Lỗi xóa thông báo', error: err.message });
    }
  }

  static async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const notification = await Notification.findByPk(id);

      if (!notification) {
        return res.status(404).json({ message: 'Không tìm thấy thông báo' });
      }

      await notification.update({ read_at: new Date() });

      const io = req.app.get('io');
      if (io) {
        io.to(notification.user_id.toString()).emit('notificationRead', {
          id: notification.id,
          user_id: notification.user_id,
          read_at: notification.read_at,
        });
      }

      return res.json({ message: 'Đánh dấu thông báo đã đọc thành công' });
    } catch (err) {
      console.error('Lỗi đánh dấu thông báo:', err);
      return res.status(500).json({ message: 'Lỗi đánh dấu thông báo', error: err.message });
    }
  }

  static async markAllAsRead(req, res) {
    try {
      const { user_id } = req.body;
      if (!user_id) {
        return res.status(400).json({ message: 'Thiếu user_id' });
      }

      await Notification.update(
        { read_at: new Date() },
        { where: { user_id, read_at: null } }
      );

      const io = req.app.get('io');
      if (io) {
        io.to(user_id.toString()).emit('allNotificationsRead', { user_id });
      }

      return res.json({ message: 'Đánh dấu tất cả thông báo đã đọc thành công' });
    } catch (err) {
      console.error('Lỗi đánh dấu tất cả thông báo:', err);
      return res.status(500).json({ message: 'Lỗi đánh dấu tất cả thông báo', error: err.message });
    }
  }
}


module.exports = NotificationController;