const AddressModel = require('../../models/addressesModel');
const UserModel = require('../../models/usersModel');
const { Op } = require('sequelize');

class AddressController {
  static async getAllAddress(req, res) {
    try {
      const { search } = req.query;
      let whereUser = {};
      if (search) {
        whereUser = {
          name: {
            [Op.like]: `%${search}%`
          }
        };
      }

      const addresses = await AddressModel.findAll({
        include: [
          {
            model: UserModel,
            as: 'user',
            attributes: ['id', 'name', 'email'],
            where: search ? whereUser : undefined,
          }
        ]
      });

      return res.status(200).json({ success: true, data: addresses });
    } catch (error) {
      console.error('Error in AddressController.getAllAddress:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách địa chỉ' });
    }
  }

  static async getAddressDetail(req, res) {
    const { id } = req.params;
    try {
      const address = await AddressModel.findOne({
        where: { id },
        include: [
          {
            model: UserModel,
            as: 'user',
            attributes: ['id', 'name', 'email']
          }
        ]
      });

      if (!address) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy địa chỉ' });
      }

      return res.status(200).json({ success: true, data: address });
    } catch (error) {
      console.error('Error in AddressController.getAddressDetail:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi lấy chi tiết địa chỉ' });
    }
  }

  static async getAddressesByUser(req, res) {
    const userId = req.params.id;
    try {
      const addresses = await AddressModel.findAll({
        where: { user_id: userId },
        include: [
          {
            model: UserModel,
            as: 'user',
            attributes: ['id', 'name', 'email']
          }
        ]
      });

      return res.status(200).json({ success: true, data: addresses });
    } catch (error) {
      console.error('Error in AddressController.getAddressesByUser:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi lấy địa chỉ theo user' });
    }
  }

  static async addAddress(req, res) {
    const {
      address_line,
      city,
      district,
      ward,
      is_default
    } = req.body;

    const user_id = req.params.userId;

    try {
      if (!user_id) {
        return res.status(400).json({ success: false, message: 'user_id là bắt buộc' });
      }

      // if (is_default) {
      //   await AddressModel.update({ is_default: false }, { where: { user_id } });
      // }

      const addressCount = await AddressModel.count({ where: { user_id } });

      if (addressCount === 0) {
        req.body.is_default = true;
      }

      if (req.body.is_default) {
        await AddressModel.update({ is_default: false }, { where: { user_id } });
      }

      const newAddress = await AddressModel.create({
        address_line,
        city,
        district,
        ward,
        is_default: !!is_default,
        user_id
      });

      return res.status(201).json({ success: true, data: newAddress, message: 'Thêm địa chỉ thành công' });
    } catch (error) {
      console.error('Error in AddressController.addAddress:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi thêm địa chỉ' });
    }
  }

  static async updateAddress(req, res) {
    const { id } = req.params;
    const {
      address_line,
      city,
      district,
      ward,
      is_default
    } = req.body;

    try {
      const address = await AddressModel.findOne({ where: { id } });
      if (!address) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy địa chỉ' });
      }

      // Nếu đang set địa chỉ này thành mặc định thì set các địa chỉ khác của user về false
      if (is_default) {
        await AddressModel.update(
          { is_default: false },
          {
            where: {
              user_id: address.user_id,
              id: { [Op.ne]: id }
            }
          }
        );
      }

      await AddressModel.update(
        {
          address_line,
          city,
          district,
          ward,
          is_default: !!is_default
        },
        { where: { id } }
      );

      return res.status(200).json({ success: true, message: 'Cập nhật địa chỉ thành công' });
    } catch (error) {
      console.error('Error in AddressController.updateAddress:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật địa chỉ' });
    }
  }

  static async deleteAddress(req, res) {
    const { id } = req.params;

    try {
      const address = await AddressModel.findOne({ where: { id } });
      if (!address) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy địa chỉ' });
      }

      await AddressModel.destroy({ where: { id } });
      return res.status(200).json({ success: true, message: 'Xóa địa chỉ thành công' });
    } catch (error) {
      console.error('Error in AddressController.deleteAddress:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi xóa địa chỉ' });
    }
  }
}

module.exports = AddressController;
