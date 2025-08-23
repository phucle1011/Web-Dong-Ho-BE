const CommentModel = require('../../models/commentsModel');
const CommentImageModel = require('../../models/commentImagesModel');
const OrderDetailModel = require('../../models/orderDetailsModel');
const ProductVariantModel = require('../../models/productVariantsModel');
const ProductModel = require('../../models/productsModel');
const UserModel = require('../../models/usersModel');
const axios = require("axios");

// ✅ Hàm kiểm duyệt ảnh tích hợp trực tiếp
const checkImageModeration = async (imageUrl) => {
  try {
    const response = await axios.get("https://api.sightengine.com/1.0/check.json", {
      params: {
        url: imageUrl,
        models: "nudity,wad,offensive",
        api_user: process.env.SIGHTENGINE_USER,
        api_secret: process.env.SIGHTENGINE_SECRET,
      },
    });

    const result = response.data;

    const isNude = result.nudity?.safe < 0.85;
    const isWeapon = result.weapon > 0.5;
    const isOffensive = result.offensive?.prob > 0.5;

    if (isNude || isWeapon || isOffensive) {
      return { valid: false, reason: result };
    }

    return { valid: true, reason: result };
  } catch (err) {
    console.error("Lỗi kiểm duyệt ảnh:", err.message);
    return { valid: false, reason: "Lỗi kiểm duyệt ảnh" };
  }
};

class ClientCommentController {
  // ===== 1. Gửi bình luận =====
  static async addComment(req, res) {
    const t = await CommentModel.sequelize.transaction();
    try {
      const {
        user_id,
        order_detail_id,
        rating,
        comment_text,
        parent_id = null,
        images = []
      } = req.body;

      if (!user_id) {
        await t.rollback();
        return res.status(401).json({ success: false, message: "Thiếu user_id" });
      }

      const [results] = await CommentModel.sequelize.query(
        'SELECT id FROM comments WHERE user_id = ? AND order_detail_id = ? LIMIT 1',
        {
          replacements: [user_id, order_detail_id],
          type: CommentModel.sequelize.QueryTypes.SELECT,
          transaction: t
        }
      );

      if (results && results.id) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "Bạn đã đánh giá sản phẩm này rồi."
        });
      }

      const newComment = await CommentModel.create({
        user_id,
        order_detail_id,
        parent_id,
        rating,
        comment_text
      }, { transaction: t });

      if (images.length > 0) {
        for (const url of images) {
          const result = await checkImageModeration(url);
          if (!result.valid) {
            await t.rollback();
            return res.status(400).json({
              success: false,
              message: "Ảnh vi phạm tiêu chuẩn cộng đồng!",
              detail: result.reason,
            });
          }
        }

        const commentImages = images.map(url => ({
          comment_id: newComment.id,
          image_url: url
        }));
        await CommentImageModel.bulkCreate(commentImages, { transaction: t });
      }

      await t.commit();

      return res.status(201).json({
        success: true,
        message: 'Gửi bình luận thành công',
        data: newComment
      });

    } catch (error) {
      await t.rollback();
      console.error('Error in addComment:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server khi gửi bình luận'
      });
    }
  }

  // ===== 2. Cập nhật bình luận =====
 static async updateComment(req, res) {
  const t = await CommentModel.sequelize.transaction();
  try {
    const { id } = req.params;
    const { rating, comment_text, images = [] } = req.body;

    // Kiểm tra hợp lệ
    if (!comment_text?.trim()) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "Vui lòng nhập nội dung bình luận!" });
    }
    if (!rating || rating < 1 || rating > 5) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "Vui lòng chọn số sao hợp lệ!" });
    }

    const comment = await CommentModel.findOne({
      where: { id },
      attributes: ['id', 'user_id', 'order_detail_id', 'parent_id', 'rating', 'comment_text', 'edited', 'created_at', 'updated_at'],
      include: [
        {
          model: OrderDetailModel,
          as: 'orderDetail',
          attributes: ['id', 'product_variant_id'],
          required: false, // ✅ fix: tránh lỗi nếu không có
          include: [
            {
              model: ProductVariantModel,
              as: 'variant',
              attributes: ['id', 'product_id'],
              required: false,
              include: [
                {
                  model: ProductModel,
                  as: 'product',
                  attributes: ['id', 'name'],
                  required: false
                }
              ]
            }
          ]
        }
      ],
      transaction: t
    });

    if (!comment) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Không tìm thấy bình luận để cập nhật" });
    }

    if (comment.edited) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "Bạn chỉ được chỉnh sửa đánh giá một lần." });
    }

    // Cập nhật nội dung
    await comment.update({
      rating,
      comment_text,
      edited: true
    }, { transaction: t });

    // Xoá ảnh cũ
    await CommentImageModel.destroy({
      where: { comment_id: id },
      transaction: t
    });

    // Kiểm duyệt ảnh mới
    if (images.length > 0) {
      for (const url of images) {
        const result = await checkImageModeration(url);
        if (!result.valid) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: "Ảnh vi phạm tiêu chuẩn cộng đồng!",
            detail: result.reason,
          });
        }
      }

      // Lưu ảnh mới
      const newImages = images.map((url) => ({
        comment_id: id,
        image_url: url
      }));
      await CommentImageModel.bulkCreate(newImages, { transaction: t });
    }

    await t.commit();

    return res.status(200).json({
      success: true,
      message: "Cập nhật bình luận thành công",
      data: comment
    });

  } catch (error) {
    await t.rollback();
    console.error("Error in updateComment:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật bình luận"
    });
  }
}


  // ===== 3. Lấy bình luận theo product_id =====
  static async getCommentsByProductSlug(req, res) {
  try {
    const { slug } = req.params;

    // Tìm sản phẩm theo slug
    const product = await ProductModel.findOne({
      where: { slug },
      attributes: ["id"],
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm." });
    }

    const comments = await CommentModel.findAll({
      attributes: [
        "id",
        "user_id",
        "order_detail_id",
        "parent_id",
        "rating",
        "comment_text",
        "created_at",
        "updated_at",
      ],
      include: [
        {
          model: OrderDetailModel,
          as: "orderDetail",
          attributes: ["id", "order_id", "product_variant_id", "quantity", "price"],
          required: true,
          include: [
            {
              model: ProductVariantModel,
              as: "variant",
              attributes: ["id", "sku", "price", "product_id"],
              where: { product_id: product.id }, // ✅ dùng id lấy từ slug
              required: true,
              include: [
                {
                  model: ProductModel,
                  as: "product",
                  attributes: ["id", "thumbnail", "slug"],
                },
              ],
            },
          ],
        },
        {
          model: UserModel,
          as: "user",
          attributes: ["id", "name", "email"],
        },
        {
          model: CommentImageModel,
          as: "commentImages",
          attributes: ["id", "image_url"],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    return res.status(200).json({ success: true, data: comments });
  } catch (error) {
    console.error("Error in getCommentsByProductSlug:", error);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi server khi lấy bình luận theo sản phẩm" });
  }
}

}

module.exports = ClientCommentController;
