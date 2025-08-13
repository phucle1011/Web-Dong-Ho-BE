const UserModel = require('../../models/usersModel');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
const { Op } = require('sequelize');

async function cleanupRememberTokens() {
    try {
        const users = await UserModel.findAll({ where: { remember_token: { [Op.not]: null } } });

        for (const user of users) {
            const token = user.remember_token;
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                const now = Math.floor(Date.now() / 1000);

                if (decoded.exp < now) {
                    await user.update({ remember_token: null });
                }
            } catch (err) {
                await user.update({ remember_token: null });
            }
        }
    } catch (error) {
        console.error("Lỗi khi dọn dẹp remember_token:", error);
    }
}

module.exports = cleanupRememberTokens;