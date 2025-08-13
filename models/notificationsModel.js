const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const NotificationModel = connection.define('notifications', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  thumbnail: {
    type: DataTypes.STRING,
    allowNull: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1
  },
  // Ngày bắt đầu thông báo
  start_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  // Ngày kết thúc thông báo
  end_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'notifications',
  timestamps: false // Đã tự quản lý created_at
});

module.exports = NotificationModel;
