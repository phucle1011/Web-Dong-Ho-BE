const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const WithdrawRequestsModel = connection.define('withdraw_requests', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    amount: {
        type: DataTypes.DECIMAL(20, 10),
        allowNull: true
    },
    method: {
        type: DataTypes.ENUM('bank'),
        allowNull: true
    },
    bank_account: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    receiver_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: true
    },
    note: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    bank_name: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    type: {
        type: DataTypes.ENUM('withdraw', 'refund', 'recharge'),
        allowNull: true,
        defaultValue: 'withdraw'
    },
    order_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    cancellation_reason: {
        type: DataTypes.STRING,
        allowNull: true
    },
}, {
    tableName: 'withdraw_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = WithdrawRequestsModel;