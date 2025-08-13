const AddressModel = require("../../models/addressesModel");
const UserModel = require("../../models/usersModel");
const { Op } = require("sequelize");

class AddressController {
  static async getAddressesByUser(req, res) {
    const userId = req.params.id;

    try {
      const addresses = await AddressModel.findAll({
        where: { user_id: userId },
        include: [
          {
            model: UserModel,
            as: "user",
            attributes: ["id", "name", "email"],
          },
        ],
        order: [
          ["is_default", "DESC"],
          ["created_at", "DESC"],
        ],
      });

      return res.status(200).json({ success: true, data: addresses });
    } catch (error) {
      console.error("Error in getAddressesByUser:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi server khi lấy địa chỉ theo user",
      });
    }
  }

  static async addAddress(req, res) {
    const user_id = req.params.userId;
    const {
      address_line = "",
      district = "",
      province = "",
      is_default = false,
    } = req.body;

    if (
      address_line.trim() === "" ||
      district.trim() === "" ||
      province.trim() === "" 
    ) {
      return res.status(400).json({
        success: false,
        message: "Thiếu dữ liệu bắt buộc: address_line,  district, province",
      });
    }

    try {
      if (is_default) {
        await AddressModel.update({ is_default: false }, { where: { user_id } });
      }

      const newAddress = await AddressModel.create({
        user_id,
        address_line,
        district,
        province,
        is_default: !!is_default,
      });

      return res.status(201).json({ success: true, data: newAddress });
    } catch (error) {
      console.error("Error in addAddress:", error);
      return res
        .status(500)
        .json({ success: false, message: "Lỗi server khi thêm địa chỉ" });
    }
  }

  static async updateAddress(req, res) {
    const user_id = req.params.userId;
    const address_id = req.params.id;
    const {
      address_line = "",
      district = "",
      province = "",
      is_default = false,
    } = req.body;

    try {
      const address = await AddressModel.findByPk(address_id);

      if (!address || address.user_id !== parseInt(user_id)) {
        return res.status(404).json({ success: false, message: "Không tìm thấy địa chỉ" });
      }

      if (is_default) {
        await AddressModel.update(
          { is_default: false },
          {
            where: {
              user_id,
              id: { [Op.ne]: address_id },
            },
          }
        );
      }

      await address.update({
        address_line,
        district,
        province,
        is_default: !!is_default,
      });

      return res.status(200).json({ success: true, data: address });
    } catch (error) {
      console.error("Error in updateAddress:", error);
      return res
        .status(500)
        .json({ success: false, message: "Lỗi server khi cập nhật địa chỉ" });
    }
  }

  static async deleteAddress(req, res) {
    const user_id = req.params.userId;
    const address_id = req.params.id;

    try {
      const address = await AddressModel.findByPk(address_id);

      if (!address || address.user_id !== parseInt(user_id)) {
        return res.status(404).json({ success: false, message: "Không tìm thấy địa chỉ" });
      }

      await address.destroy();

      return res.status(200).json({ success: true, message: "Đã xoá địa chỉ" });
    } catch (error) {
      console.error("Error in deleteAddress:", error);
      return res
        .status(500)
        .json({ success: false, message: "Lỗi server khi xoá địa chỉ" });
    }
  }
}

module.exports = AddressController;
