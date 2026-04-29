let ioInstance = null;

function initializeJobEvents(io) {
  ioInstance = io;
}

function joinJobRoom(socket) {
  socket.on('job:subscribe', ({ jobId }) => {
    if (!jobId) return;
    socket.join(`job:${jobId}`);
  });
}

function emitJobEvent(jobId, eventName, payload) {
  if (!ioInstance || !jobId) return;
  ioInstance.to(`job:${jobId}`).emit(eventName, payload);
}

module.exports = {
  initializeJobEvents,
  joinJobRoom,
  emitJobEvent,
};
