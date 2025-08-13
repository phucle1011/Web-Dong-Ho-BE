const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const UserModel = connection.define('users', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    phone: {
        type: DataTypes.STRING,
        allowNull: true
    },
    avatar: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM('user', 'admin'),
        allowNull: false,
        defaultValue: 'user'
    },
    email_verified_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    remember_token: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    password_reset_token: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active'
    },
    lockout_reason: {
        type: DataTypes.STRING,
        allowNull: true
    },
    last_active_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    balance: {
        type: DataTypes.DECIMAL(20, 0),
        allowNull: true
    },
    failed_payment_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0
    }
}, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = UserModel;