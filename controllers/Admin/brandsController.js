const BrandModel = require('../../models/brandsModel');
const { Op } = require('sequelize');
const slugify = require('slugify');

class BrandController {
    static async get(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;
            const { status, searchTerm } = req.query;
            const whereClause = {};

            if (searchTerm) {
                whereClause[Op.or] = [
                    { name: { [Op.like]: `%${searchTerm}%` } },
                    { country: { [Op.like]: `%${searchTerm}%` } }
                ];
            }

            if (status && status !== 'all' && !searchTerm) {
                whereClause.status = status;
            }

            const brands = await BrandModel.findAndCountAll({
                where: whereClause,
                order: [['created_at', 'DESC']],
                limit,
                offset
            });

            const allStatuses = ['active', 'inactive'];
            const [activeCount, inactiveCount] = await Promise.all(
                allStatuses.map(s => BrandModel.count({ where: { status: s } }))
            );

            const counts = {
                all: await BrandModel.count(),
                active: activeCount,
                inactive: inactiveCount
            };

            res.status(200).json({
                status: 200,
                message: "Lấy danh sách thương hiệu thành công",
                data: brands.rows,
                totalPages: Math.ceil(brands.count / limit),
                currentPage: page,
                counts
            });
        } catch (error) {
            console.error("Lỗi khi lấy danh sách thương hiệu:", error);
            res.status(500).json({ error: error.message });
        }
    }

    static async getById(req, res) {
        try {
            const { id } = req.params;
            const brand = await BrandModel.findByPk(id);
            if (!brand) {
                return res.status(404).json({ message: "Không tìm thấy thương hiệu với ID này" });
            }
            res.status(200).json({
                status: 200,
                message: "Lấy thông tin thương hiệu thành công",
                data: brand,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async create(req, res) {
        try {
            const { name, slug, country, description, status, logo } = req.body;

            let errors = {};

            if (!name || typeof name !== 'string' || name.trim().length < 2) {
                errors.name = "Tên thương hiệu phải có ít nhất 2 ký tự.";
            }

            if (!country || typeof country !== 'string') {
                errors.country = "Quốc gia không hợp lệ.";
            }

            if (description !== undefined && typeof description !== 'string') {
                errors.description = "Mô tả phải là chuỗi.";
            }

            if (!status || !['active', 'inactive'].includes(status)) {
                errors.status = "Trạng thái không hợp lệ.";
            }

            if (logo !== undefined && (
                typeof logo !== 'string' ||
                !/^https?:\/\//.test(logo)
            )) {
                errors.logo = "Logo phải là URL hợp lệ.";
            }

            if (Object.keys(errors).length > 0) {
                return res.status(400).json({
                    status: 400,
                    message: "Dữ liệu không hợp lệ.",
                    errors,
                });
            }

            const cleanName = name.trim();
            const cleanCountry = country.trim();
            const cleanDescription = description?.trim() || null;
            const generatedSlug = slugify(slug || cleanName, { lower: true, locale: 'vi' });

            const existingBrand = await BrandModel.findOne({ where: { slug: generatedSlug } });
            if (existingBrand) {
                return res.status(400).json({
                    status: 400,
                    message: "Thương hiệu đã tồn tại với tên hoặc slug này.",
                    errors: { name: "Tên thương hiệu này đã tồn tại." },
                });
            }

            const newBrand = await BrandModel.create({
                name: cleanName,
                slug: generatedSlug,
                country: cleanCountry,
                description: cleanDescription,
                status,
                logo: logo || null,
            });

            res.status(201).json({
                status: 201,
                message: "Tạo thương hiệu thành công",
                data: newBrand,
            });
        } catch (error) {
            console.error("Lỗi trong hàm tạo thương hiệu:", error);
            res.status(500).json({
                status: 500,
                message: "Lỗi nội bộ máy chủ khi tạo thương hiệu.",
                error: error.message,
            });
        }
    }

    static async update(req, res) {
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                return res.status(400).json({ status: 400, message: "ID không hợp lệ" });
            }

            const brand = await BrandModel.findByPk(id);
            if (!brand) {
                return res.status(404).json({ status: 404, message: "Không tìm thấy thương hiệu" });
            }

            const updateData = {};
            const fields = ['name', 'country', 'description', 'status', 'logo'];

            for (const field of fields) {
                if (req.body[field] !== undefined) {
                    updateData[field] = req.body[field];
                }
            }

            // Kiểm tra slug mới nếu có name
            if (updateData.name) {
                const newSlug = slugify(updateData.name, { lower: true, locale: 'vi' });
                const existingBrand = await BrandModel.findOne({
                    where: {
                        slug: newSlug,
                        id: { [Op.ne]: id }
                    }
                });

                if (existingBrand) {
                    return res.status(400).json({
                        status: 400,
                        message: "Thương hiệu đã tồn tại với tên hoặc slug này.",
                        errors: { name: "Tên thương hiệu này đã tồn tại." }
                    });
                }

                updateData.slug = newSlug;
            }

            await BrandModel.update(updateData, { where: { id } });
            const updated = await BrandModel.findByPk(id);

            // Tính toán lại số lượng brands
            const allStatuses = ['active', 'inactive'];
            const countPromises = allStatuses.map(s =>
                BrandModel.count({ where: { status: s } })
            );
            const countsByStatus = await Promise.all(countPromises);

            const counts = {
                all: await BrandModel.count(),
                active: countsByStatus[0],
                inactive: countsByStatus[1],
            };

            return res.status(200).json({
                status: 200,
                message: "Cập nhật thương hiệu thành công!",
                data: updated,
                counts // Trả về counts
            });
        } catch (error) {
            console.error("Lỗi khi cập nhật thương hiệu:", error);
            return res.status(500).json({ status: 500, message: "Lỗi máy chủ", error: error.message });
        }
    }
    static async updateLogo(req, res) {
        try {
            const { id } = req.params;
            const { logo } = req.body;

            const brand = await BrandModel.findByPk(id);
            if (!brand) {
                return res.status(404).json({ message: "Thương hiệu không tồn tại." });
            }

            brand.logo = logo;
            await brand.save();

            return res.status(200).json({
                message: "Cập nhật logo thành công.",
                data: brand,
            });
        } catch (error) {
            console.error("Lỗi khi cập nhật logo:", error);
            return res.status(500).json({ message: "Lỗi server.", error: error.message });
        }
    }


    static async delete(req, res) {
        try {
            const { id } = req.params;
            const brand = await BrandModel.findByPk(id);
            if (!brand) {
                return res.status(404).json({ message: "Không tìm thấy thương hiệu với ID này" });
            }
            await BrandModel.destroy({ where: { id } });

            const allStatuses = ['active', 'inactive'];
            const countPromises = allStatuses.map(s =>
                BrandModel.count({ where: { status: s } })
            );
            const countsByStatus = await Promise.all(countPromises);

            const counts = {
                all: await BrandModel.count(),
                active: countsByStatus[0],
                inactive: countsByStatus[1],
            };

            res.status(200).json({
                status: 200,
                message: "Xóa thương hiệu thành công",
                counts
            });
        } catch (error) {
            console.error("Lỗi khi xóa thương hiệu:", error);
            res.status(500).json({ error: error.message });
        }
    }

    static async search(req, res) {
        try {
            const { searchTerm, page = 1, limit = 10, status } = req.query;
            const currentPage = parseInt(page);
            const currentLimit = parseInt(limit);
            const offset = (currentPage - 1) * currentLimit;

            if (!searchTerm?.trim()) {
                return res.status(400).json({
                    status: 400,
                    message: "Vui lòng nhập từ khóa để tìm kiếm."
                });
            }

            const whereClause = {
                [Op.or]: [
                    { name: { [Op.like]: `%${searchTerm}%` } },
                    { country: { [Op.like]: `%${searchTerm}%` } },
                ]
            };

            if (status === 'active' || status === 'inactive') {
                whereClause.status = status;
            }

            const brands = await BrandModel.findAndCountAll({
                where: whereClause,
                order: [['created_at', 'DESC']],
                limit: currentLimit,
                offset: offset
            });

            const { count, rows } = brands;

            if (count === 0) {
                return res.status(200).json({
                    status: 200,
                    message: "Không tìm thấy thương hiệu nào phù hợp.",
                    data: [],
                    totalPages: 1,
                    currentPage: currentPage
                });
            }

            const allCount = await BrandModel.count();
            const activeCount = await BrandModel.count({ where: { status: 'active' } });
            const inactiveCount = await BrandModel.count({ where: { status: 'inactive' } });

            return res.status(200).json({
                status: 200,
                message: "Tìm kiếm thương hiệu thành công",
                data: rows,
                totalPages: Math.ceil(count / currentLimit),
                currentPage: currentPage,
                counts: {
                    all: allCount,
                    active: status === 'active' ? count : activeCount,
                    inactive: status === 'inactive' ? count : inactiveCount
                }
            });
        } catch (error) {
            console.error("Lỗi khi tìm kiếm thương hiệu:", error);
            return res.status(500).json({
                status: 500,
                error: error.message
            });
        }
    }

    static async getActiveBrands(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;
            const brands = await BrandModel.findAndCountAll({
                where: { status: 'active' },
                order: [['name', 'ASC']],
                limit: limit,
                offset: offset
            });
            res.status(200).json({
                status: 200,
                message: "Lấy danh sách thương hiệu đang hoạt động thành công",
                data: brands.rows,
                totalPages: Math.ceil(brands.count / limit),
                currentPage: page,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getInactiveBrands(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;
            const brands = await BrandModel.findAndCountAll({
                where: { status: 'inactive' },
                order: [['name', 'ASC']],
                limit: limit,
                offset: offset
            });
            res.status(200).json({
                status: 200,
                message: "Lấy danh sách thương hiệu không hoạt động thành công",
                data: brands.rows,
                totalPages: Math.ceil(brands.count / limit),
                currentPage: page,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = BrandController;