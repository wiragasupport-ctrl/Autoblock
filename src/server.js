const express = require("express");
const path = require("path");
const {
  startWhatsApp,
  getStatus,
  getQRCode
} = require("./whatsapp");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/status", (req, res) => {
  res.json(getStatus());
});

app.get("/api/qr", (req, res) => {
  const qr = getQRCode();

  if (!qr) {
    return res.json({
      available: false
    });
  }

  res.json({
    available: true,
    qr
  });
});

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "public", "index.html")
  );
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);

  startWhatsApp().catch((error) => {
    console.error("WhatsApp startup error:", error);
  });
});
