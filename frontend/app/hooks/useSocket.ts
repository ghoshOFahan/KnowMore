import { io, Socket } from "socket.io-client";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "../types/socket";

// Stable singleton socket — one connection for the whole app session
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<
  ServerToClientEvents,
  ClientToServerEvents
> {
  if (!socket) {
    socket = io(
      process.env.NEXT_PUBLIC_SOCKET_URL ??
        "https://knowmore-backend.jollybay-f5e1622e.centralindia.azurecontainerapps.io",
      {
        withCredentials: true,
        autoConnect: true,
      },
    );
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function useSocket() {
  return getSocket();
}
