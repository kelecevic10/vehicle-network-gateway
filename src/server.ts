import { WebSocketServer } from "ws"

const server = new WebSocketServer({
    host: "127.0.0.1",
    port: 8080,
});

server.on("listening", () => {
    console.log("Gateway listening on ws://127.0.0.1:8080"); 
});

server.on("error", console.error)

server.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("error", console.error);

    socket.on("message", (data) => {
        console.log("Received:", data.toString()); 
        socket.send("Message received!");
    });

    socket.on("close", () => {
        console.log("Client disconnected"); 
    });
});

