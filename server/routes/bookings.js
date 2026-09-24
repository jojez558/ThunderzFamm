const express = require("express");
const { mutate, newId } = require("../db");
const { sendMail } = require("../mailer");
const rateLimit = require("../middleware/rateLimit");
const { text, email } = require("../validation");

const router = express.Router();

router.post(
  "/",
  rateLimit({
    windowMs: 15 * 60_000,
    max: 5,
    message: "Too many booking requests. Please try again later.",
  }),
  async (req, res) => {
    const {
      name,
      email: customerEmail,
      service,
      budget,
      date,
      message,
    } = req.body || {};

    let bookingFields;
    try {
      bookingFields = {
        name: text(name, "Name", { required: true, max: 100 }),
        email: email(customerEmail),
        service: text(service, "Service", { max: 80 }),
        budget: text(budget, "Budget", { max: 60 }),
        date: text(date, "Date", { max: 30 }),
        message: text(message, "Message", { max: 2000 }),
      };
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const booking = {
      id: newId("bk"),
      ...bookingFields,
      status: "new",
      createdAt: new Date().toISOString(),
    };

    await mutate((data) => {
      data.bookings.unshift(booking);
    });

    try {
      await sendMail({
        subject: `New booking inquiry — ${booking.name}`,
        text: [
          `Name: ${booking.name}`,
          `Email: ${booking.email}`,
          `Service needed: ${booking.service}`,
          `Budget range: ${booking.budget}`,
          `Preferred date: ${booking.date}`,
          "",
          "Message:",
          booking.message,
        ].join("\n"),
      });
    } catch (err) {
      // Don't fail the request just because the notification email failed —
      // the booking is already saved and visible in the admin panel.
      console.error("Booking email notification failed:", err.message);
    }

    res.status(201).json({ ok: true });
  },
);

module.exports = router;
