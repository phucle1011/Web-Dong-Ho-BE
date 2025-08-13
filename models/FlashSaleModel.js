const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const FlashSaleModel = connection.define('flash_sale', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  promotion_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'promotions', // tên bảng tham chiếu
      key: 'id'
    },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  },
  notification_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'notifications', // tên bảng tham chiếu
      key: 'id'
    },
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  }
}, {
  tableName: 'flash_sale',
  timestamps: false
});

module.exports = FlashSaleModel;
