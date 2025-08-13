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
            const { userId, productVariantId, quantity } = req.body;

            const variant = await ProductVariantsModel.findOne({
                where: { id: productVariantId },
                attributes: ['id', 'stock'],
            });

            if (!variant || variant.stock < quantity) {
                return res.status(400).json({ status: 400, message: 'Sản phẩm không đủ tồn kho.' });
            }

            const [cartItem, created] = await CartModel.findOrCreate({
                where: { user_id: userId, product_variant_id: productVariantId },
                defaults: { quantity },
            });

            if (!created) {
                cartItem.quantity += quantity;
                await cartItem.save();
            }

            // Xoá khỏi wishlist
            await WishlistModel.destroy({
                where: { user_id: userId, product_variant_id: productVariantId },
            });

            res.status(200).json({
                status: 200,
                message: 'Đã thêm sản phẩm vào giỏ hàng và xoá khỏi danh sách yêu thích.',
                data: cartItem,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Thêm tất cả wishlist vào giỏ hàng và xoá khỏi wishlist
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
            });

            if (!wishlistItems.length) {
                return res.status(404).json({ status: 404, message: 'Danh sách yêu thích trống.' });
            }

            const transaction = await WishlistModel.sequelize.transaction();
            try {
                const addedItems = [];
                const errors = [];

                for (const item of wishlistItems) {
                    const { product_variant_id: productVariantId, variant } = item;
                    const quantity = 1;

                    if (variant.stock < quantity) {
                        errors.push(`Sản phẩm ID ${productVariantId} không đủ tồn kho.`);
                        continue;
                    }

                    const [cartItem, created] = await CartModel.findOrCreate({
                        where: {
                            user_id: userId,
                            product_variant_id: productVariantId,
                        },
                        defaults: { quantity },
                        transaction,
                    });

                    if (!created) {
                        cartItem.quantity += quantity;
                        await cartItem.save({ transaction });
                    }

                    addedItems.push(cartItem);
                }

                if (errors.length > 0) {
                    await transaction.rollback();
                    return res.status(400).json({
                        status: 400,
                        message: 'Một số sản phẩm không thể thêm vào giỏ hàng.',
                        errors,
                    });
                }

                // Xoá khỏi wishlist các sản phẩm đã thêm
                const variantIdsToRemove = addedItems.map(i => i.product_variant_id);
                await WishlistModel.destroy({
                    where: {
                        user_id: userId,
                        product_variant_id: { [Op.in]: variantIdsToRemove },
                    },
                    transaction,
                });

                await transaction.commit();
                res.status(200).json({
                    status: 200,
                    message: 'Đã thêm tất cả sản phẩm và xoá khỏi danh sách yêu thích.',
                    data: addedItems,
                });
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

}

module.exports = WishlistController;
