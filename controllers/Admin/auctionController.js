const cron = require('node-cron');
const { Op } = require('sequelize');
const UsersModel = require('../../models/usersModel');
const ProductVariantModel = require('../../models/productVariantsModel');
const AuctionModel = require('../../models/auctionsModel');
const ProductModel = require('../../models/productsModel');
const CategoryModel = require('../../models/categoriesModel');
const BrandModel = require('../../models/brandsModel');
const ProductVariantAttributeValuesModel = require('../../models/productVariantAttributeValuesModel');
const ProductAttributeModel = require('../../models/productAttributesModel');
const VariantImageModel = require('../../models/variantImagesModel');
const AuctionBidModel = require('../../models/auctionBidsModel');
const OrderModel = require('../../models/ordersModel');
const OrderDetailModel = require('../../models/orderDetailsModel');
const CartModel = require('../../models/cartDetailsModel');

const { fn, col, literal, where } = require('../../config/database');

class auctionController {

   //--------------------------[ GET ALL ]---------------------------
   // static async get(req, res) {
   //    try {
   //       const page = parseInt(req.query.page) || 1;
   //       const limit = parseInt(req.query.limit) || 10;
   //       const offset = (page - 1) * limit;

   //       const { searchTerm, startDate, endDate, status } = req.query;
   //       const whereClause = {};

   //       if (searchTerm) {
   //          whereClause.product_variant_id = {
   //             [Op.like]: `%${searchTerm}%`,
   //          };
   //       }

   //       if (startDate || endDate) {
   //          whereClause.start_time = {};
   //          if (startDate) {
   //             whereClause.start_time[Op.gte] = new Date(`${startDate}T00:00:00`);
   //          }
   //          if (endDate) {
   //             whereClause.start_time[Op.lte] = new Date(`${endDate}T23:59:59`);
   //          }
   //       }

   //       const allAuctions = await AuctionModel.findAll({
   //          where: whereClause,
   //          include: [
   //             {
   //                model: ProductVariantModel,
   //                as: 'variant',
   //                include: [
   //                   {
   //                      model: ProductModel,
   //                      as: 'product',
   //                      include: [
   //                         {
   //                            model: CategoryModel,
   //                            as: 'category',
   //                         },
   //                         {
   //                            model: BrandModel,
   //                            as: "brand"
   //                         }
   //                      ],
   //                   },
   //                   {
   //                      model: ProductVariantAttributeValuesModel,
   //                      as: 'attributeValues',
   //                      include: [
   //                         {
   //                            model: ProductAttributeModel,
   //                            as: 'attribute',
   //                         },
   //                      ],
   //                   },
   //                   {
   //                      model: VariantImageModel,
   //                      as: 'images',
   //                   },
   //                ],
   //             },
   //          ],
   //          order: [['start_time', 'ASC']],
   //       });

   //       const statusCounts = {
   //          all: allAuctions.length,
   //          upcoming: allAuctions.filter(a => a.status === "upcoming").length,
   //          active: allAuctions.filter(a => a.status === "active").length,
   //          ended: allAuctions.filter(a => a.status === "ended").length,
   //       };

   //       let filteredAuctions = allAuctions;
   //       if (status === "upcoming" || status === "active" || status === "ended") {
   //          filteredAuctions = allAuctions.filter(a => a.status === status);
   //       }

   //       const statusPriority = { active: 1, upcoming: 2, ended: 3 };

   //       filteredAuctions.sort((a, b) => {
   //          const priorityA = statusPriority[a.status] || 99;
   //          const priorityB = statusPriority[b.status] || 99;

   //          if (priorityA === priorityB) {
   //             if (a.status === "ended") {
   //                return new Date(b.start_time) - new Date(a.start_time);
   //             } else {
   //                return new Date(a.start_time) - new Date(b.start_time);
   //             }
   //          }

   //          return priorityA - priorityB;
   //       });

   //       const paginatedAuctions = filteredAuctions.slice(offset, offset + limit);

   //       return res.status(200).json({
   //          status: 200,
   //          message: "Lấy danh sách phiên đấu giá thành công",
   //          data: paginatedAuctions,
   //          pagination: {
   //             currentPage: page,
   //             totalPages: Math.ceil(filteredAuctions.length / limit),
   //             totalItems: filteredAuctions.length,
   //          },
   //          statusCounts,
   //       });
   //    } catch (error) {
   //       console.error("Lỗi khi lấy danh sách đấu giá:", error);
   //       return res.status(500).json({ message: "Lỗi server, vui lòng thử lại sau!" });
   //    }
   // }

   static async get(req, res) {
      try {
         const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
         const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
         const offset = (page - 1) * limit;

         const { searchTerm, startDate, endDate, status } = req.query;

         const whereAuction = {};

         if (startDate || endDate) {
            whereAuction.start_time = {};
            if (startDate) whereAuction.start_time[Op.gte] = new Date(`${startDate}T00:00:00`);
            if (endDate) whereAuction.start_time[Op.lte] = new Date(`${endDate}T23:59:59`);
         }

         if (['upcoming', 'active', 'ended'].includes(status)) {
            whereAuction.status = status;
         }

         const includeDef = [
            {
               model: ProductVariantModel,
               as: 'variant',
               required: true,
               include: [
                  {
                     model: ProductModel,
                     as: 'product',
                     required: true,
                     include: [
                        { model: CategoryModel, as: 'category' },
                        { model: BrandModel, as: 'brand' },
                     ],
                  },
                  {
                     model: ProductVariantAttributeValuesModel,
                     as: 'attributeValues',
                     include: [{ model: ProductAttributeModel, as: 'attribute' }],
                  },
                  { model: VariantImageModel, as: 'images' },
               ],
            },
         ];

         const finalWhere = { ...whereAuction };
         if (searchTerm && String(searchTerm).trim() !== '') {
            const raw = String(searchTerm).trim();
            const term = `%${raw}%`;

            let namePart = null, skuPart = null;
            const m = raw.match(/^(.+?)\s*\((.+?)\)\s*$/);
            if (m) {
               namePart = m[1].trim();
               skuPart = m[2].trim();
            }

            const orConds = [
               where(col('variant.sku'), { [Op.like]: term }),
               where(col('variant->product.name'), { [Op.like]: term }),

               { product_variant_id: { [Op.like]: term } },
            ];

            if (namePart || skuPart) {
               const andConds = [];
               if (namePart) andConds.push(where(col('variant->product.name'), { [Op.like]: `%${namePart}%` }));
               if (skuPart) andConds.push(where(col('variant.sku'), { [Op.like]: `%${skuPart}%` }));
               if (andConds.length) orConds.push({ [Op.and]: andConds });
            }

            finalWhere[Op.or] = orConds;
         }

         const statusPriorityCase = literal(`
  CASE 
    WHEN \`auctions\`.\`status\` = 'active' THEN 1
    WHEN \`auctions\`.\`status\` = 'upcoming' THEN 2
    WHEN \`auctions\`.\`status\` = 'ended' THEN 3
    ELSE 99
  END
`);

         const nonEndedTimeSort = literal(`
  CASE WHEN \`auctions\`.\`status\` <> 'ended' THEN \`auctions\`.\`start_time\` END
`);

         const endedTimeSort = literal(`
  CASE WHEN \`auctions\`.\`status\` = 'ended' THEN \`auctions\`.\`start_time\` END
`);

         const { rows: auctions, count: totalItems } = await AuctionModel.findAndCountAll({
            where: finalWhere,
            include: includeDef,
            order: [
               [statusPriorityCase, 'ASC'],
               [nonEndedTimeSort, 'ASC'],
               [endedTimeSort, 'DESC'],
            ],
            limit,
            offset,
            distinct: true,
         });

         const whereForCounts = { ...finalWhere };
         delete whereForCounts.status;

         const statusCountRows = await AuctionModel.findAll({
            where: whereForCounts,

            include: [
               {
                  model: ProductVariantModel,
                  as: 'variant',
                  required: true,
                  attributes: [],
                  include: [
                     {
                        model: ProductModel,
                        as: 'product',
                        required: true,
                        attributes: [],
                     },
                  ],
               },
            ],
            attributes: [
               [col('auctions.status'), 'status'],
               [fn('COUNT', col('auctions.id')), 'count'],
            ],
            group: [col('auctions.status')],
            raw: true,
            subQuery: false,
         });

         const statusCounts = { all: 0, upcoming: 0, active: 0, ended: 0 };
         for (const r of statusCountRows) {
            const s = r.status;
            const c = Number(r.count) || 0;
            if (['upcoming', 'active', 'ended'].includes(s)) statusCounts[s] = c;
            statusCounts.all += c;
         }

         return res.status(200).json({
            status: 200,
            message: 'Lấy danh sách phiên đấu giá thành công',
            data: auctions,
            pagination: {
               currentPage: page,
               totalPages: Math.ceil(totalItems / limit),
               totalItems,
            },
            statusCounts,
         });
      } catch (error) {
         console.error('Lỗi khi lấy danh sách đấu giá:', error);
         return res.status(500).json({ message: 'Lỗi server, vui lòng thử lại sau!' });
      }
   }

   static async getAuctionProduct(req, res) {
      try {
         const { Op } = require('sequelize');
         const auctionId = req.query.auctionId;
         let currentVariantId = null;

         if (auctionId) {
            const auction = await AuctionModel.findByPk(auctionId, {
               attributes: ['product_variant_id'],
               raw: true
            });
            if (auction) {
               currentVariantId = auction.product_variant_id;
            }
         }

         const used = await AuctionModel.findAll({
            where: { status: { [Op.in]: ['upcoming', 'active'] } },
            attributes: ['product_variant_id'],
            group: ['product_variant_id'],
            raw: true
         });
         let usedIds = used.map(u => u.product_variant_id);

         if (currentVariantId !== null) {
            usedIds = usedIds.filter(id => id !== currentVariantId);
         }

         const cartVariants = await CartModel.findAll({
            attributes: ['product_variant_id'],
            group: ['product_variant_id'],
            raw: true
         });
         const idsInCart = cartVariants.map(c => c.product_variant_id);
         const excludeSet = new Set([...usedIds, ...idsInCart]);

         if (currentVariantId !== null) {
            excludeSet.delete(currentVariantId);
         }
         const excludeIds = Array.from(excludeSet);

         // const whereClause = {
         //    is_auction_only: 1,
         //    ...(usedIds.length > 0 && { id: { [Op.notIn]: usedIds } })
         // };

         const whereClause = {
            is_auction_only: 1,
            stock: { [Op.gt]: 0 },
            ...(excludeIds.length > 0 && { id: { [Op.notIn]: excludeIds } })
         };

         const auctionProducts = await ProductVariantModel.findAll({
            where: whereClause,
            include: [
               {
                  model: ProductModel,
                  as: "product",
                  where: {
                     publication_status: "published",
                     status: 1,
                  },
                  required: true,
               },
            ],
            order: [["created_at", "DESC"]],
         });

         return res.status(200).json({ data: auctionProducts });
      }
      catch (error) {
         console.error("Lỗi server:", error);
         return res.status(500).json({ message: "Lỗi server, vui lòng thử lại sau!" });
      }
   }

   //--------------------------[ GET ID ]---------------------------
   static async getId(req, res) {
      try {
         const { id } = req.params;
         const moment = require("moment-timezone");

         const auction = await AuctionModel.findOne({
            where: { id },
            include: [{ model: ProductVariantModel, as: "variant" }],
         });

         if (!auction) {
            return res.status(404).json({ message: "Phiên đấu giá không tồn tại!" });
         }

         const startTimeStr = moment(auction.start_time).tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss");
         const endTimeStr = moment(auction.end_time).tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss");

         const now = moment().tz("Asia/Ho_Chi_Minh");
         if (moment(startTimeStr).isBefore(now) && moment(endTimeStr).isAfter(now)) {
            auction.dataValues.status = "active";
         } else if (moment(startTimeStr).isAfter(now)) {
            auction.dataValues.status = "upcoming";
         } else {
            auction.dataValues.status = "ended";
         }

         return res.status(200).json({
            status: 200,
            message: "Lấy thông tin phiên đấu giá thành công",
            data: auction,
         });
      } catch (error) {
         console.error("Lỗi server:", error);
         return res.status(500).json({ message: "Lỗi server, vui lòng thử lại sau!" });
      }
   }

   //--------------------------[ CREATE ]---------------------------
   static async create(req, res) {
      try {
         const {
            product_variant_id,
            start_time,
            end_time,
            priceStep,
         } = req.body;

         const now = new Date(new Date().toISOString());

         const moment = require('moment-timezone');

         const startTime = moment.tz(start_time, "YYYY-MM-DD HH:mm:ss", "Asia/Ho_Chi_Minh").toDate();
         const endTime = moment.tz(end_time, "YYYY-MM-DD HH:mm:ss", "Asia/Ho_Chi_Minh").toDate();

         if (startTime.getTime() === endTime.getTime()) {
            return res.status(400).json({
               message: "Thời gian bắt đầu và kết thúc không được trùng nhau.",
            });
         }

         if (startTime >= endTime) {
            return res.status(400).json({
               message: "Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc.",
            });
         }

         if (startTime < now) {
            return res.status(400).json({
               message: "Thời gian bắt đầu không được nhỏ hơn thời gian hiện tại.",
            });
         }

         const variantInCart = await CartModel.count({ where: { product_variant_id } });
         if (variantInCart > 0) {
            return res.status(400).json({
               message: "Biến thể đang có trong giỏ hàng, không thể tạo phiên đấu giá.",
            });
         }

         const conflict = await AuctionModel.findOne({
            where: {
               product_variant_id,
               [Op.or]: [
                  {
                     start_time: {
                        [Op.between]: [start_time, end_time],
                     },
                  },
                  {
                     end_time: {
                        [Op.between]: [start_time, end_time],
                     },
                  },
                  {
                     [Op.and]: [
                        { start_time: { [Op.lte]: start_time } },
                        { end_time: { [Op.gte]: end_time } },
                     ],
                  },
               ],
            },
         });

         if (conflict) {
            return res.status(400).json({
               message: "Đã có phiên đấu giá trùng khoảng thời gian này!",
            });
         }

         const auctions = await AuctionModel.create({
            product_variant_id,
            priceStep,
            start_time: startTime,
            end_time: endTime,
            status: "upcoming",
         });

         return res.status(201).json({
            message: "Tạo phiên đấu giá thành công!",
            data: auctions,
         });

      } catch (error) {
         console.error("Lỗi server:", error);
         return res.status(500).json({
            message: "Lỗi server, vui lòng thử lại sau!",
         });
      }
   }

   //--------------------------[ UPDATE ]---------------------------
   static async update(req, res) {
      try {
         const { id } = req.params;
         const {
            product_variant_id,
            start_time,
            end_time,
            priceStep,
         } = req.body;

         const now = new Date(new Date().toISOString());
         const moment = require('moment-timezone');

         const startTime = moment.tz(start_time, "YYYY-MM-DD HH:mm:ss", "Asia/Ho_Chi_Minh").toDate();
         const endTime = moment.tz(end_time, "YYYY-MM-DD HH:mm:ss", "Asia/Ho_Chi_Minh").toDate();

         if (startTime.getTime() === endTime.getTime()) {
            return res.status(400).json({
               message: "Thời gian bắt đầu và kết thúc không được trùng nhau.",
            });
         }

         if (startTime >= endTime) {
            return res.status(400).json({
               message: "Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc.",
            });
         }

         if (startTime < now) {
            return res.status(400).json({
               message: "Thời gian bắt đầu không được nhỏ hơn thời gian hiện tại.",
            });
         }

         const auction = await AuctionModel.findByPk(id);
         if (!auction) {
            return res.status(404).json({ message: "Không tìm thấy phiên đấu giá." });
         }

         if (auction.status === 'active' || auction.status === 'ended') {
            return res.status(400).json({
               message: `Không thể cập nhật phiên đã có trạng thái '${auction.status}'.`,
            });
         }

         const variantInCart = await CartModel.count({ where: { product_variant_id } });
         if (variantInCart > 0) {
            return res.status(400).json({
               message: "Biến thể đang có trong giỏ hàng, không thể cập nhật phiên đấu giá.",
            });
         }

         const conflict = await AuctionModel.findOne({
            where: {
               id: { [Op.ne]: id },
               product_variant_id,
               [Op.or]: [
                  { start_time: { [Op.between]: [startTime, endTime] } },
                  { end_time: { [Op.between]: [startTime, endTime] } },
                  {
                     [Op.and]: [
                        { start_time: { [Op.lte]: startTime } },
                        { end_time: { [Op.gte]: endTime } },
                     ],
                  },
               ],
            },
         });

         if (conflict) {
            return res.status(400).json({
               message: "Có phiên đấu giá khác trùng thời gian!",
            });
         }

         await AuctionModel.update(
            {
               product_variant_id,
               priceStep,
               start_time: startTime,
               end_time: endTime,
            },
            {
               where: { id },
            }
         );

         const updatedAuction = await AuctionModel.findByPk(id);

         return res.status(200).json({
            message: "Cập nhật phiên đấu giá thành công!",
            data: updatedAuction,
         });

      } catch (error) {
         console.error("Lỗi khi cập nhật phiên đấu giá:", error);
         return res.status(500).json({
            message: "Lỗi server, vui lòng thử lại sau!",
         });
      }
   }

   //--------------------------[ DELETE ]---------------------------
   static async delete(req, res) {
      try {
         const { id } = req.params;

         const auction = await AuctionModel.findOne({ where: { id } });
         if (!auction) {
            return res.status(404).json({ message: "Phiên đấu giá không tồn tại!" });
         }

         if (auction.status === 'active' || auction.status === 'ended') {
            return res.status(400).json({
               message: `Không thể xoá phiên đấu giá có trạng thái '${auction.status}'.`,
            });
         }

         await AuctionModel.destroy({ where: { id } });

         return res.status(200).json({ message: "Xoá phiên đấu giá thành công!" });

      } catch (error) {
         console.error("Lỗi server khi xoá phiên đấu giá:", error);
         return res.status(500).json({ message: "Lỗi server, vui lòng thử lại sau!" });
      }
   }

   static async getWinner(req, res) {
      try {
         const { id } = req.params;

         const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
         const limit = Math.max(parseInt(req.query.limit, 10) || 5, 1);
         const offset = (page - 1) * limit;

         const auction = await AuctionModel.findOne({
            where: { id },
            include: [
               {
                  model: ProductVariantModel,
                  as: 'variant',
                  include: [
                     {
                        model: ProductModel,
                        as: 'product',
                        attributes: ['id', 'name']
                     }
                  ],
                  attributes: ['id', 'sku']
               }
            ],
            attributes: ['id', 'priceStep', 'start_time', 'end_time', 'status']
         });

         if (!auction) {
            return res.status(404).json({ message: "Phiên đấu giá không tồn tại!" });
         }

         const topBid = await AuctionBidModel.findOne({
            where: { auction_id: id },
            include: [
               {
                  model: UsersModel,
                  as: 'user',
                  attributes: ['id', 'name', 'email']
               }
            ],
            order: [['bidAmount', 'DESC']],
         });

         const { count: totalItems, rows: bids } = await AuctionBidModel.findAndCountAll({
            where: { auction_id: id },
            include: [{ model: UsersModel, as: 'user', attributes: ['id', 'name', 'email'] }],
            order: [
               ['bidAmount', 'DESC'],
               ['bidTime', 'ASC']
            ],
            limit,
            offset
         });

         const allBids = await AuctionBidModel.findAll({
            where: { auction_id: id },
            include: [{
               model: UsersModel,
               as: 'user',
               attributes: ['id', 'name', 'email']
            }],
            order: [
               ['bidAmount', 'DESC'],
               ['bidTime', 'ASC']
            ],
         });

         if (!topBid) {
            return res.status(200).json({
               message: "Chưa có người chiến thắng cho phiên này",
               data: {
                  auction,
                  winner: null,
                  winningBid: null,
                  bids,
                  pagination: {
                     page,
                     limit,
                     totalPages: Math.ceil(totalItems / limit),
                     totalItems
                  },
                  hasPaid: false
               }
            });
         }

         const winner = topBid.user;

         const detail = await OrderDetailModel.findOne({
            where: { auction_id: id },
            include: [{
               model: OrderModel,
               as: 'order',
               where: { user_id: winner.id },
               attributes: ['status', 'payment_method']
            }]
         });

         const orderStatus = detail?.order.status || null;
         const paymentMethod = detail?.order.payment_method || null;

         const hasPaid = orderStatus != null && !['cancelled'].includes(orderStatus);

         const paymentDeadline = new Date(auction.end_time).getTime() + 24 * 3600 * 1000;
         const expiredPaymentWindow = Date.now() > paymentDeadline;

         return res.status(200).json({
            message: "Lấy người chiến thắng và lịch sử đặt giá thành công",
            data: {
               auction,
               winner: winner,
               winningBid: {
                  id: topBid.id,
                  bidAmount: topBid.bidAmount,
                  bidTime: topBid.bidTime,
               },
               bids,
               allBids: allBids.map(b => ({
                  id: b.id,
                  user: b.user,
                  bidAmount: b.bidAmount,
                  bidTime: b.bidTime,
               })),
               pagination: {
                  page,
                  limit,
                  totalPages: Math.ceil(totalItems / limit),
                  totalItems
               },
               hasPaid,
               orderStatus,
               paymentMethod,
               expiredPaymentWindow
            }
         });
      } catch (error) {
         console.error("Lỗi khi lấy người chiến thắng:", error);
         return res.status(500).json({ message: "Lỗi server, vui lòng thử lại sau!" });
      }
   }

   static async hasUserPaidAuction(auctionId, userId) {
      const order = await OrderModel.findOne({
         where: { user_id: userId },
         include: [{
            model: OrderDetailModel,
            as: 'orderDetails',
            where: { auction_id: auctionId }
         }]
      });

      if (!order) return false;

      return order.status !== 'pending' && order.status !== 'confirmed' && order.status !== 'shipping' && order.status !== 'delivered' && order.status !== 'completed';
   }

   static async isVariantInAnyCart(variantId) {
      const count = await CartModel.count({
         where: { variant_id: variantId }
      });
      return count > 0;
   }
}

module.exports = auctionController;