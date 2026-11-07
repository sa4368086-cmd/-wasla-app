const socket = io();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const statusText = document.getElementById("status");

const startBtn = document.getElementById("startBtn");
const nextBtn = document.getElementById("nextBtn");
const stopBtn = document.getElementById("stopBtn");

let localStream = null;
let peer = null;
let pendingCandidates = [];

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;
    statusText.textContent = "الكاميرا والميكروفون يعملان";
  } catch (error) {
    statusText.textContent = "اسمح باستخدام الكاميرا والميكروفون";
    throw error;
  }
}

function createPeer() {
  peer = new RTCPeerConnection(config);

  localStream.getTracks().forEach(track => {
    peer.addTrack(track, localStream);
  });

  peer.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  peer.onicecandidate = event => {
    if (event.candidate) {
      socket.emit("signal", {
        candidate: event.candidate
      });
    }
  };
}

async function findPartner() {
  if (!localStream) await startCamera();

  socket.emit("find-partner");
  statusText.textContent = "جاري البحث عن شخص...";
}

socket.on("waiting", () => {
  statusText.textContent = "في انتظار شخص للاتصال...";
});

socket.on("matched", async () => {
  statusText.textContent = "تم العثور على شخص! جاري الاتصال...";

  createPeer();

  if (socket.id < (peer.remoteId || "")) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("signal", { description: peer.localDescription });
  }
});

socket.on("signal", async data => {
  if (!peer) createPeer();

  try {
    if (data.description) {
      await peer.setRemoteDescription(data.description);

      if (data.description.type === "offer") {
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit("signal", {
          description: peer.localDescription
        });
      }

      for (const candidate of pendingCandidates) {
        await peer.addIceCandidate(candidate);
      }
      pendingCandidates = [];
    }

    if (data.candidate) {
      if (peer.remoteDescription) {
        await peer.addIceCandidate(data.candidate);
      } else {
        pendingCandidates.push(data.candidate);
      }
    }
  } catch (error) {
    console.error(error);
  }
});

socket.on("partner-left", () => {
  statusText.textContent = "الشخص الآخر غادر. اضغط التالي للبحث مجددًا.";
  closePeer();
});

function closePeer() {
  if (peer) {
    peer.close();
    peer = null;
  }

  remoteVideo.srcObject = null;
  pendingCandidates = [];
}

startBtn.addEventListener("click", findPartner);

nextBtn.addEventListener("click", () => {
  closePeer();
  socket.emit("next");
  findPartner();
});

stopBtn.addEventListener("click", () => {
  closePeer();
  socket.emit("next");

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  localVideo.srcObject = null;
  statusText.textContent = "تم إيقاف الكاميرا والاتصال";
});
