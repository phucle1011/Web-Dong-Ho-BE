const WishlistModel = require('../../models/wishlistsModel');
const ProductVariantsModel = require('../../models/productVariantsModel');
const ProductModel = require('../../models/productsModel');
const UserModel = require('../../models/usersModel');
const ProductVariantAttributeValueModel = require("../../models/productVariantAttributeValuesModel");
const ProductAttributeModel = require("../../models/productAttributesModel");
const VariantImageModel = require("../../models/variantImagesModel");
const CartModel = require("../../models/cartDetailsModel");

const { Op } = require('sequelize');

class WishlistController {

    // Lấy toàn bộ wishlist (admin)
    static async getAllWishlists(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;

            const wishlists = await WishlistModel.findAndCountAll({
                limit,
                offset,
                order: [['id', 'DESC']],
                include: [
                    {
                        model: ProductVariantsModel,
                        as: 'variant',
                        attributes: ['id', 'price'],
                        include: [
                            {
                                model: ProductModel,
                                as: 'product',
                                attributes: ['id', 'name', 'slug', 'thumbnail'],
                            },
                        ],
                    },
                    {
                        model: UserModel,
                        as: 'user',
                        attributes: ['id', 'name', 'email'],
                    },
                ],
            });

            res.status(200).json({
                status: 200,
                message: "Lấy danh sách wishlist thành công",
                data: wishlists.rows,
                totalPages: Math.ceil(wishlists.count / limit),
                currentPage: page,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Lấy wishlist theo user
    static async getWishlistByUser(req, res) {
        try {
            const { userId } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;

            const wishlists = await WishlistModel.findAndCountAll({
                where: { user_id: userId },
                limit,
                offset,
                order: [['id', 'DESC']],
                include: [
                    {
                        model: ProductVariantsModel,
                        as: 'variant',
                        attributes: ['id', 'price', 'sku', 'stock'],
                        include: [
                            {
                                model: ProductModel,
                                as: 'product',
                                attributes: ['id', 'name', 'slug', 'thumbnail'],
                            },
                            {
                                model: ProductVariantAttributeValueModel,
                                as: 'attributeValues',
                                attributes: ['value'],
                                include: [{
                                    model: ProductAttributeModel,
                                    as: 'attribute',
                                    attributes: ['name'],
                                }],
                            },
                            {
                                model: VariantImageModel,
                                as: 'images',
                                attributes: ['image_url'],
                                required: false,
                            },
                        ],
                    },
                    {
                        model: UserModel,
                        as: 'user',
                        attributes: ['id', 'name', 'email', 'phone', 'avatar', 'status'],
                    },
                ],
            });

            res.status(200).json({
                status: 200,
                message: `Lấy danh sách yêu thích của người dùng ${userId} thành công`,
                data: wishlists.rows,
                totalPages: Math.ceil(wishlists.count / limit),
                currentPage: page,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Thêm sản phẩm vào wishlist
    static async addToWishlist(req, res) {
        try {
            const { userId, productVariantId } = req.body;

            const exists = await WishlistModel.findOne({
                where: { user_id: userId, product_variant_id: productVariantId },
            });

            if (exists) {
                return res.status(409).json({ status: 409, message: 'Sản phẩm đã có trong danh sách yêu thích.' });
            }

            const newItem = await WishlistModel.create({
                user_id: userId,
                product_variant_id: productVariantId,
            });

            res.status(201).json({
                status: 201,
                message: 'Đã thêm sản phẩm vào danh sách yêu thích.',
                data: newItem,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Xóa sản phẩm khỏi wishlist
    static async removeFromWishlist(req, res) {
        try {
            const { userId, productVariantId } = req.params;

            const deleted = await WishlistModel.destroy({
                where: { user_id: userId, product_variant_id: productVariantId },
            });

            if (deleted === 0) {
                return res.status(404).json({ status: 404, message: 'Không tìm thấy sản phẩm để xoá.' });
            }

            res.status(200).json({ status: 200, message: 'Đã xóa sản phẩm khỏi danh sách yêu thích.' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Xoá toàn bộ wishlist của user
    static async clearWishlist(req, res) {
        try {
            const { userId } = req.params;

            const deleted = await WishlistModel.destroy({ where: { user_id: userId } });

            if (deleted === 0) {
                return res.status(404).json({ status: 404, message: 'Danh sách đã trống hoặc không tồn tại.' });
            }

            res.status(200).json({ status: 200, message: 'Đã xóa toàn bộ danh sách yêu thích.' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Thêm từng sản phẩm vào giỏ hàng từ wishlist và xoá khỏi wishlist
    static async addSingleWishlistItemToCart(req, res) {
        try {
            let { userId, productVariantId, quantity } = req.body;

            // Validate body
            if (!userId || !productVariantId) {
                return res.status(400).json({ status: 400, code: 'BAD_REQUEST', message: 'Thiếu userId hoặc productVariantId.' });
            }

            userId = Number(userId);
            productVariantId = Number(productVariantId);
            quantity = Number(quantity ?? 1);
            if (!Number.isInteger(quantity) || quantity <= 0) {
                return res.status(400).json({ status: 400, code: 'INVALID_QUANTITY', message: 'quantity không hợp lệ.' });
            }

            // Bắt buộc phải còn trong wishlist
            const existsInWishlist = await WishlistModel.findOne({
                where: { user_id: userId, product_variant_id: productVariantId },
            });
            if (!existsInWishlist) {
                return res.status(404).json({
                    status: 404,
                    code: 'NOT_IN_WISHLIST',
                    message: 'Sản phẩm không còn trong danh sách yêu thích.',
                });
            }

            const t = await WishlistModel.sequelize.transaction();
            try {
                // Lock biến thể để tránh race khi cộng số lượng
                const variant = await ProductVariantsModel.findOne({
                    where: { id: productVariantId },
                    attributes: ['id', 'stock'],
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });

                if (!variant) {
                    await t.rollback();
                    return res.status(404).json({ status: 404, code: 'VARIANT_NOT_FOUND', message: 'Không tìm thấy biến thể.' });
                }

                const stock = Number(variant.stock ?? 0);
                if (stock <= 0) {
                    await t.rollback();
                    return res.status(409).json({ status: 409, code: 'OUT_OF_STOCK', message: 'Sản phẩm đã hết hàng.' });
                }

                const [cartItem, created] = await CartModel.findOrCreate({
                    where: { user_id: userId, product_variant_id: productVariantId },
                    defaults: { user_id: userId, product_variant_id: productVariantId, quantity },
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });

                const currentQty = Number(cartItem.quantity ?? 0);
                const newQty = created ? quantity : currentQty + quantity;

                if (newQty > stock) {
                    await t.rollback();
                    return res.status(409).json({
                        status: 409,
                        code: 'QTY_EXCEEDS_STOCK',
                        message: `Số lượng vượt quá tồn kho (còn ${stock}).`,
                        meta: { available: stock, requested: newQty },
                    });
                }

                if (!created) {
                    cartItem.quantity = newQty;
                    await cartItem.save({ transaction: t });
                }

                // Xoá khỏi wishlist (idempotent)
                await WishlistModel.destroy({
                    where: { user_id: userId, product_variant_id: productVariantId },
                    transaction: t,
                });

                await t.commit();
                return res.status(200).json({
                    status: 200,
                    code: 'OK',
                    message: 'Đã thêm sản phẩm vào giỏ hàng và xoá khỏi danh sách yêu thích.',
                    data: { product_variant_id: productVariantId, quantity: created ? quantity : cartItem.quantity },
                });
            } catch (err) {
                await t.rollback();
                console.error('[addSingleWishlistItemToCart] TX error:', err);
                return res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Lỗi xử lý giỏ hàng.', error: err?.message });
            }
        } catch (error) {
            console.error('[addSingleWishlistItemToCart] error:', error);
            return res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Lỗi máy chủ.', error: error?.message });
        }
    }

    // Thêm tất cả wishlist vào giỏ hàng và xoá khỏi wishlist (partial success)
    static async addWishlistToCart(req, res) {
        try {
            const { userId } = req.params;

            const wishlistItems = await WishlistModel.findAll({
                where: { user_id: userId },
                include: [{
                    model: ProductVariantsModel,
                    as: 'variant',
                    attributes: ['id', 'stock'],
                }],
                order: [['id', 'ASC']],
            });

            if (!wishlistItems.length) {
                return res.status(404).json({ status: 404, code: 'EMPTY_WISHLIST', message: 'Danh sách yêu thích trống.' });
            }

            const successes = [];
            const failures = [];

            // Xử lý từng item độc lập để có partial success
            for (const item of wishlistItems) {
                const productVariantId = item.product_variant_id;
                const qty = 1;

                try {
                    await WishlistModel.sequelize.transaction(async (t) => {
                        const variant = await ProductVariantsModel.findOne({
                            where: { id: productVariantId },
                            attributes: ['id', 'stock'],
                            transaction: t,
                            lock: t.LOCK.UPDATE,
                        });

                        if (!variant) {
                            failures.push({
                                product_variant_id: productVariantId,
                                reason: 'VARIANT_NOT_FOUND',
                                message: 'Không tìm thấy biến thể.',
                            });
                            return;
                        }

                        const stock = Number(variant.stock ?? 0);
                        if (stock <= 0) {
                            failures.push({
                                product_variant_id: productVariantId,
                                reason: 'OUT_OF_STOCK',
                                message: 'Sản phẩm đã hết hàng.',
                                meta: { available: 0 },
                            });
                            return;
                        }

                        const [cartItem, created] = await CartModel.findOrCreate({
                            where: { user_id: userId, product_variant_id: productVariantId },
                            defaults: { user_id: userId, product_variant_id: productVariantId, quantity: qty },
                            transaction: t,
                            lock: t.LOCK.UPDATE,
                        });

                        const newQty = created ? qty : Number(cartItem.quantity ?? 0) + qty;
                        if (newQty > stock) {
                            failures.push({
                                product_variant_id: productVariantId,
                                reason: 'QTY_EXCEEDS_STOCK',
                                message: `Số lượng vượt quá tồn kho (còn ${stock}).`,
                                meta: { available: stock, requested: newQty },
                            });
                            return;
                        }

                        if (!created) {
                            cartItem.quantity = newQty;
                            await cartItem.save({ transaction: t });
                        }

                        await WishlistModel.destroy({
                            where: { user_id: userId, product_variant_id: productVariantId },
                            transaction: t,
                        });

                        successes.push({ product_variant_id: productVariantId, quantity: created ? qty : newQty });
                    });
                } catch (e) {
                    console.error('[addWishlistToCart] item error:', e);
                    failures.push({
                        product_variant_id: productVariantId,
                        reason: 'INTERNAL_ERROR',
                        message: 'Lỗi xử lý item.',
                        meta: { error: e?.message },
                    });
                }
            }

            const partial = failures.length > 0 && successes.length > 0;

            return res.status(200).json({
                status: 200,
                code: partial ? 'PARTIAL_SUCCESS' : 'OK',
                message: partial
                    ? `Đã thêm ${successes.length} sản phẩm. ${failures.length} sản phẩm lỗi.`
                    : `Đã thêm ${successes.length} sản phẩm vào giỏ hàng.`,
                data: { successes, failures },
            });
        } catch (error) {
            console.error('[addWishlistToCart] error:', error);
            return res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Lỗi máy chủ.', error: error?.message });
        }
    }

}

module.exports = WishlistController;
