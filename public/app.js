const statusElement =
  document.getElementById("status");

const numberElement =
  document.getElementById("number");

const qrContainer =
  document.getElementById("qr-container");

const qrImage =
  document.getElementById("qr");

const connectedElement =
  document.getElementById("connected");


async function updateStatus() {

  try {

    const response =
      await fetch("/api/status");

    const data =
      await response.json();

    if (data.connected) {

      statusElement.textContent =
        "● WhatsApp Connected";

      statusElement.className =
        "status online";

      numberElement.textContent =
        data.number || "";

      qrContainer.classList.add(
        "hidden"
      );

      connectedElement.classList.remove(
        "hidden"
      );

      return;
    }

    statusElement.textContent =
      data.state === "waiting_qr"
        ? "Menunggu scan QR"
        : "Menghubungkan...";

    statusElement.className =
      "status";

    connectedElement.classList.add(
      "hidden"
    );

  } catch (error) {

    statusElement.textContent =
      "Server tidak tersedia";

  }
}


async function updateQR() {

  try {

    const response =
      await fetch("/api/qr");

    const data =
      await response.json();

    if (
      data.available &&
      data.qr
    ) {

      /*
       * QR dibuat di browser.
       * Tidak disimpan sebagai file.
       */

      const qrResponse =
        await fetch(
          "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" +
          encodeURIComponent(data.qr)
        );

      const blob =
        await qrResponse.blob();

      qrImage.src =
        URL.createObjectURL(blob);

      qrContainer.classList.remove(
        "hidden"
      );

    } else {

      qrContainer.classList.add(
        "hidden"
      );

    }

  } catch (error) {

    console.error(
      "QR error:",
      error
    );

  }
}


async function refresh() {

  await updateStatus();

  await updateQR();

}


refresh();

setInterval(
  refresh,
  2000
);
