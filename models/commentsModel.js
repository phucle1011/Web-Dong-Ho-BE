const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const CommentModel = connection.define('comments', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    order_detail_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    rating: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    comment_text: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    edited: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    }
}, {
    tableName: 'comments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = CommentModel;