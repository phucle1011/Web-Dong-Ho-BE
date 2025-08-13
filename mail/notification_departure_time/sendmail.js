const axios = require('axios');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const dayjs = require('dayjs');

let sentEmails = new Set();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'quynhctppc08873@gmail.com',
    pass: 'nmyhrrpxvhfakwth',
  },
});


cron.schedule('* * * * *', async () => {
  try {
    const response = await axios.get('https://web-dong-ho-be.onrender.com/admin/booking/list');
    const bookings = response.data.data;

    const now = dayjs();


    bookings.forEach((booking) => {
      const status = booking.status;
      const email = booking.emailUser;
      const departure = booking.Trip?.departureTime;
      const bookingId = booking.id;


      if (status === 'confirmed' && email && departure) {
        const departureTime = dayjs(departure);

        const diff = departureTime.diff(now, 'minute');

        if (diff <= 30 && diff >= 29 && !sentEmails.has(bookingId)) {
          transporter.sendMail({
            from: 'quynhctppc08873@gmail.com',
            to: email,
            subject: '⏰ Nhắc nhở chuyến xe sắp khởi hành',
            html: `
  <div style="font-family: Arial, sans-serif; background-color: #f7f7f7; padding: 20px; color: #333;">
    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);">
      
      <img src="https://i.pinimg.com/736x/2a/a7/07/2aa7076f864ca5fe1dad52794f91dcea.jpg" alt="Bus" style="width: 100%; height: auto;">
      
      <div style="padding: 20px;">
        <h2 style="color: #007bff;">⏰ Nhắc nhở chuyến xe sắp khởi hành</h2>
        
        <p>Chào bạn,</p>
        
        <p>Bạn có một chuyến xe dự kiến <strong>khởi hành lúc ${departureTime.format('HH:mm DD/MM/YYYY')}</strong>.</p>
        
        <p>Hãy đến sớm tại điểm đón để không bị lỡ chuyến nhé 🚐</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        
        <p style="font-size: 14px; color: #666;">
          Cảm ơn bạn đã đặt vé tại hệ thống của chúng tôi. Chúc bạn có một chuyến đi an toàn và thuận lợi!
        </p>
        
        <p style="font-size: 14px; color: #999;">— Hệ thống đặt vé</p>
      </div>
    </div>
  </div>
`

          }, (err, info) => {
            if (err) {
              console.error('Lỗi gửi mail:', err);
            } else {
              sentEmails.add(bookingId);
            }
          });
        }
      }
    });
  } catch (error) {
    console.error('🚨Lỗi khi lấy booking:', error.message);
  }
});
