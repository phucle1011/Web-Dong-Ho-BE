const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const Notification_promotionsModel = connection.define('notification_promotions', {
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
  tableName: 'notification_promotions',
  timestamps: false
});

module.exports = Notification_promotionsModel;
