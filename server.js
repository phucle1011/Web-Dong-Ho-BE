require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const session = require("express-session");
const app = express();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
const cron = require('node-cron');
const { Sequelize, Op } = require('sequelize');
const OrderModel = require('./models/ordersModel');
const cleanupRememberTokens = require('./controllers/Client/rememberTokenCleanup');
const authenticate = require('./services/Middleware');
const updateLastActive = require('./config/middleware/updateLastActive');
const { authAdmin } = require('./services/authCheck');
const notifyWishlistPromotions = require('./services/notifyWishlistPromotions');
const attachUser = require('./services/attachUser');


const webhookRoutes = require('./routes/webhookRoutes');
app.use('/stripe/webhook', express.raw({type: 'application/json'}), webhookRoutes);


cron.schedule('* * * * *', async () => {
  try {
    // 2h: - 2 * 60 * 1000
    const twoMinutesAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

    const ordersToUpdate = await OrderModel.findAll({
      where: {
        status: 'completed',
        updated_at: {
          [Op.lte]: twoMinutesAgo,
        },
      },
    });

    for (const order of ordersToUpdate) {
      order.status = 'delivered';
      await order.save();
    }

  } catch (error) {
    console.error("Lỗi khi kiểm tra và cập nhật trạng thái đơn hàng:", error);
  }
});

cron.schedule('* * * * *', () => {
  cleanupRememberTokens();
});


cron.schedule('0 9 * * *', () => {
  notifyWishlistPromotions();
});

app.use(cors());

require('./models/connectsModel');
require('./controllers/Admin/cronJobController');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const clientRoutes = require('./routes/clientRoutes');
const adminRoutes = require('./routes/adminRoutes');

const apiRoutes = require('./routes/apiRoutes');

app.use('/public', express.static('public'));
app.use('/uploads', express.static('uploads'));

app.use(cors({
  origin: "*",
  methods: "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  allowedHeaders: "Content-Type, Authorization",
  credentials: true
}));

app.use(apiRoutes);
app.use(clientRoutes);
app.use('/admin', adminRoutes);
app.use('/', attachUser, updateLastActive, clientRoutes);


const port = 5000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// (tuỳ chọn) xác thực token ở handshake
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  // TODO: verify token -> socket.user = decoded
  next();
});

// Join room theo auctionId
io.on('connection', (socket) => {

  socket.on('auction:join', ({ auctionId }) => {
    if (!auctionId) return;
    socket.join(`auction:${auctionId}`);
  });

  socket.on('disconnect', () => {});
});

// để controller dùng được io
app.set('io', io);

const runAuctionStatusJob = require('./config/middleware/auctionStatusJob');
runAuctionStatusJob(io);

server.listen(port, () => {
  console.log(`Server chạy tại http://localhost:${port}`);
});
