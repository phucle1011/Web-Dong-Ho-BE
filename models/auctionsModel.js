const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const AuctionsModel = connection.define('auctions', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    product_variant_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    priceStep: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: false
    },
    start_time: {
        type: DataTypes.DATE,
        allowNull: false
    },
    end_time: {
        type: DataTypes.DATE,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('upcoming', 'active', 'ended'),
        allowNull: false
    }
}, {
    tableName: 'auctions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = AuctionsModel;
