const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export async function makeReplayVideo(words: string[], names: string[]): Promise<Blob> {
  if (!("MediaRecorder" in window)) throw new Error("Video replay is not supported by this browser");
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not draw match replay");
  const stream = canvas.captureStream(15);
  const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Could not record replay"));
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
  });
  const draw = (visible: number) => {
    context.fillStyle = "#17152c";
    context.fillRect(0, 0, 720, 900);
    context.fillStyle = "#f1efff";
    context.font = "bold 37px Georgia";
    context.fillText("KnowMore", 54, 82);
    context.fillStyle = "#b9b2ff";
    context.font = "20px Arial";
    context.fillText("A WORD TRAIL, REPLAYED", 54, 121);
    context.strokeStyle = "#47416c";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(54, 148);
    context.lineTo(666, 148);
    context.stroke();
    const start = Math.max(0, visible - 7);
    words.slice(start, visible).forEach((word, offset) => {
      const index = start + offset;
      const x = 70 + (index % 2) * 170;
      const y = 184 + offset * 87;
      context.fillStyle = index % 2 ? "#b9b2ff" : "#ffd79a";
      context.fillRect(x, y, 355, 64);
      context.fillStyle = "#26254a";
      context.font = "bold 31px Georgia";
      context.fillText(word.slice(0, 18), x + 18, y + 42);
      context.fillStyle = "#a9a6d0";
      context.font = "16px Arial";
      context.fillText((names[index] ?? "Player").slice(0, 25), x + 8, y - 8);
      if (offset > 0) {
        context.strokeStyle = "#b9b2ff";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(x + 170, y - 19);
        context.lineTo(x + 170, y);
        context.stroke();
      }
    });
    context.fillStyle = "#a9a6d0";
    context.font = "18px Arial";
    context.fillText(`${visible} / ${words.length} words`, 54, 850);
    context.fillText("knowmore.ahanghosh.me", 445, 850);
  };
  try {
    draw(0);
    recorder.start();
    await wait(300);
    for (let index = 1; index <= words.length; index++) {
      draw(index);
      await wait(520);
    }
    await wait(700);
    recorder.stop();
    return await finished;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
