const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const AuctionBidModel = connection.define('auction_bids', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    auction_id: {
        type: DataTypes.INTEGER,
        allowNull: false 
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false 
    },
    bidAmount: {
        type: DataTypes.DECIMAL(30, 2),
        allowNull: false
    },
    bidTime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'auction_bids',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = AuctionBidModel;