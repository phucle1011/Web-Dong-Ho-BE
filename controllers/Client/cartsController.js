const CartModel = require('../../models/cartDetailsModel');
const ProductVariantsModel = require('../../models/productVariantsModel');
const ProductVariantAttributeValuesModel = require('../../models/productVariantAttributeValuesModel');
const VariantImageModel = require("../../models/variantImagesModel");
const ProductAttribute = require("../../models/productAttributesModel");
const ProductModel = require('../../models/productsModel');
const PromotionProductModel = require('../../models/promotionProductsModel');
const PromotionModel = require('../../models/promotionsModel');
const AuctionBidModel = require('../../models/auctionBidsModel');
const AuctionModel = require('../../models/auctionsModel');

const { Op } = require('sequelize');

class CartController {
    static async getCartByUser(req, res) {
        try {
            const userId = req.user.id;

            const count = await CartModel.sum('quantity', { where: { user_id: userId } });

            const cartItems = await CartModel.findAll({
                where: { user_id: userId },
                include: [
                    {
                        model: ProductVariantsModel,
                        as: 'variant',
                        attributes: ['id', 'product_id', 'price', 'stock', 'sku'],
                        include: [
                            {
                                model: ProductModel,
                                as: 'product',
                                attributes: ['id', 'name'],
                                required: false
                            },
                            {
                                model: VariantImageModel,
                                as: 'images',
                                attributes: ['image_url'],
                                required: false
                            },
                            {
                                model: ProductVariantAttributeValuesModel,
                                as: "attributeValues",
                                include: [
                                    {
                                        model: ProductAttribute,
                                        as: "attribute",
                                    },
                                ],
                            },
                            {
                                model: PromotionProductModel,
                                as: "promotionProducts",
                                include: [
                                    {
                                        model: PromotionModel,
                                        as: "promotion",
                                        where: {
                                            status: "active",
                                            start_date: { [Op.lte]: new Date() },
                                            end_date: { [Op.gte]: new Date() },
                                        },
                                        required: false,
                                    },
                                ],
                                required: false,
                            },
                            {
                                model: AuctionModel,
                                as: 'auctions',
                                where: { status: 'ended' },
                                required: false,
                                include: [
                                    {
                                        model: AuctionBidModel,
                                        as: 'bids',
                                        required: false,
                                    }
                                ]
                            }
                        ]
                    }
                ],
                order: [['id', 'DESC']]
            });

            const processedCartItems = cartItems.map(item => {
                const itemJson = item.toJSON();
                const variant = itemJson.variant;
                const quantityInCart = itemJson.quantity;

                if (variant && variant.promotionProducts && variant.promotionProducts.length > 0) {
                    const bestPromotion = variant.promotionProducts.reduce((best, promoProduct) => {
                        const promo = promoProduct.promotion;
                        const variantQuantityLimit = promoProduct.variant_quantity || 0;
                        if (!promo || variantQuantityLimit <= 0) return best;

                        const variantPrice = parseFloat(variant.price) || 0;
                        let discountPrice = variantPrice;
                        let discountPercent = 0;

                        if (promo.discount_type === "percentage") {
                            const originalPrice = discountPrice;
                            const percentValue = parseFloat(promo.discount_value);
                            let reducedAmount = (discountPrice * percentValue) / 100;

                            // ⚠ Giới hạn không giảm quá max_price
                            if (promo.max_price && reducedAmount > promo.max_price) {
                                reducedAmount = promo.max_price;
                            }

                            discountPrice -= reducedAmount;
                            discountPercent = (reducedAmount / originalPrice) * 100;
                        } else if (promo.discount_type === "fixed") {
                            discountPrice -= parseFloat(promo.discount_value);
                            discountPercent = ((variantPrice - discountPrice) / variantPrice) * 100;
                        }

                        discountPrice = Math.max(0, discountPrice);

                        // Bỏ ảnh hưởng bởi số lượng => chỉ lấy giá giảm 1 sản phẩm
                        const effectivePrice = discountPrice;

                        const newPromo = {
                            id: promo.id,
                            code: promo.code,
                            discount_type: promo.discount_type,
                            discount_value: parseFloat(promo.discount_value),
                            discounted_price: parseFloat(effectivePrice.toFixed(2)),  // chỉ 1 giá duy nhất
                            discount_percent: parseFloat(discountPercent.toFixed(2)),
                            meets_conditions: true,
                            limited_quantity: variantQuantityLimit,
                            discounted_quantity: quantityInCart, // nếu cần vẫn giữ
                            normal_quantity: 0,
                        };


                        if (!best || newPromo.discounted_price < best.discounted_price) {
                            return newPromo;
                        }
                        return best;
                    }, null);


                    variant.promotion = bestPromotion || {
                        discounted_price: parseFloat(variant.price) || 0,
                        discount_percent: 0,
                        meets_conditions: true,
                    };
                } else {
                    variant.promotion = {
                        discounted_price: parseFloat(variant.price) || 0,
                        discount_percent: 0,
                        meets_conditions: true,
                    };
                }

                return itemJson;
            });

            res.status(200).json({
                status: 200,
                message: `Lấy giỏ hàng của người dùng ${userId} thành công`,
                data: processedCartItems,
                count
            });
        } catch (error) {
            console.error("Lỗi khi lấy giỏ hàng:", error);
            res.status(500).json({
                status: 500,
                message: "Lỗi máy chủ",
                error: error.message
            });
        }
    }

    static async addToCart(req, res) {
        try {
            const { userId, productVariantId, quantity } = req.body;

            const productVariant = await ProductVariantsModel.findOne({
                where: { id: productVariantId },
                attributes: ['id', 'stock']
            });

            if (!productVariant) {
                return res.status(404).json({
                    status: 404,
                    message: "Không tìm thấy biến thể sản phẩm"
                });
            }

            let cartItem = await CartModel.findOne({
                where: {
                    user_id: userId,
                    product_variant_id: productVariantId
                }
            });

            const currentQuantity = cartItem ? cartItem.quantity : 0;
            const totalQuantity = currentQuantity + quantity;

            if (totalQuantity > productVariant.stock) {
                return res.status(400).json({
                    status: 400,
                    message: `Số lượng vượt quá tồn kho (${productVariant.stock})`
                });
            }

            if (cartItem) {
                cartItem.quantity = totalQuantity;
                await cartItem.save();
            } else {
                cartItem = await CartModel.create({
                    user_id: userId,
                    product_variant_id: productVariantId,
                    quantity
                });
            }

            const fullCartItem = await CartModel.findOne({
                where: { id: cartItem.id },
                include: [
                    {
                        model: ProductVariantsModel,
                        as: 'variant',
                        attributes: ['id', 'price', 'stock', 'sku'],
                        include: [
                            {
                                model: VariantImageModel,
                                as: 'images',
                                attributes: ['image_url'],
                                required: false
                            },
                            {
                                model: ProductVariantAttributeValuesModel,
                                as: "attributeValues",
                                include: [
                                    {
                                        model: ProductAttribute,
                                        as: "attribute",
                                    },
                                ],
                            }
                        ]
                    }
                ]
            });

            return res.status(200).json({
                status: 200,
                message: 'Thêm vào giỏ hàng thành công',
                data: fullCartItem
            });
        } catch (error) {
            console.error("Lỗi khi thêm vào giỏ hàng:", error);
            res.status(500).json({
                status: 500,
                message: "Lỗi máy chủ",
                error: error.message
            });
        }
    }

    static async updateCartItem(req, res) {
        try {
            const userId = req.user.id;
            const { productVariantId } = req.params;
            const { quantity } = req.body;

            const item = await CartModel.findOne({
                where: {
                    user_id: userId,
                    product_variant_id: productVariantId
                }
            });

            if (!item) {
                return res.status(404).json({
                    status: 404,
                    message: "Không tìm thấy sản phẩm trong giỏ hàng"
                });
            }

            item.quantity = quantity;
            await item.save();

            const fullItem = await CartModel.findOne({
                where: { id: item.id },
                include: [
                    {
                        model: ProductVariantsModel,
                        as: 'variant',
                        attributes: ['id', 'price', 'stock', 'sku'],
                        include: [
                            {
                                model: VariantImageModel,
                                as: 'images',
                                attributes: ['image_url'],
                                required: false
                            },
                            {
                                model: ProductVariantAttributeValuesModel,
                                as: "attributeValues",
                                include: [
                                    {
                                        model: ProductAttribute,
                                        as: "attribute",
                                    },
                                ],
                            }
                        ]
                    }
                ]
            });

            res.status(200).json({
                status: 200,
                message: 'Cập nhật số lượng thành công',
                data: fullItem
            });
        } catch (error) {
            console.error("Lỗi khi cập nhật giỏ hàng:", error);
            res.status(500).json({
                status: 500,
                message: "Lỗi máy chủ",
                error: error.message
            });
        }
    }

    static async removeCartItem(req, res) {
        try {
            const { productVariantId } = req.params;
            const userId = req.user.id;

            const deleted = await CartModel.destroy({
                where: {
                    user_id: userId,
                    product_variant_id: productVariantId
                }
            });

            if (!deleted) {
                return res.status(404).json({
                    status: 404,
                    message: "Không tìm thấy sản phẩm trong giỏ hàng để xóa"
                });
            }

            const remainingItems = await CartModel.findAll({
                where: { user_id: userId },
                include: [
                    {
                        model: ProductVariantsModel,
                        as: 'variant',
                        attributes: ['id', 'price', 'stock', 'sku'],
                        include: [
                            {
                                model: VariantImageModel,
                                as: 'images',
                                attributes: ['image_url'],
                                required: false
                            },
                            {
                                model: ProductVariantAttributeValuesModel,
                                as: "attributeValues",
                                include: [
                                    {
                                        model: ProductAttribute,
                                        as: "attribute",
                                    },
                                ],
                            }
                        ]
                    }
                ],
                order: [['id', 'DESC']]
            });

            res.status(200).json({
                status: 200,
                message: 'Xóa sản phẩm khỏi giỏ hàng thành công',
                data: remainingItems
            });
        } catch (error) {
            console.error("Lỗi khi xóa sản phẩm:", error);
            res.status(500).json({
                status: 500,
                message: "Lỗi máy chủ",
                error: error.message
            });
        }
    }

    static async clearCartByUser(req, res) {
        try {
            const userId = req.user.id;

            const deleted = await CartModel.destroy({
                where: {
                    user_id: userId
                }
            });

            res.status(200).json({
                status: 200,
                message: `Đã xóa toàn bộ giỏ hàng của người dùng ${userId}`,
                deletedCount: deleted
            });
        } catch (error) {
            console.error("Lỗi khi xóa toàn bộ giỏ hàng:", error);
            res.status(500).json({
                status: 500,
                message: "Lỗi máy chủ",
                error: error.message
            });
        }
    }

}

module.exports = CartController;
