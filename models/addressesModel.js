const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const AddressModel = connection.define('address', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    address_line: {
        type: DataTypes.STRING,
        allowNull: true
    },
    ward: {
        type: DataTypes.STRING,
        allowNull: false
    },
    city: {
        type: DataTypes.STRING,
        allowNull: false
    },
    district: {
        type: DataTypes.STRING,
        allowNull: false
    },
    is_default: {
        type: DataTypes.TINYINT,
        allowNull: false
    }
}, {
    tableName: 'addresses',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = AddressModel;