import WebSocket, { WebSocketServer } from "ws"
import {
    MessageType,
    type ClientAuthMessage,
    type VehicleControlMessage,
    type VehicleControlPayload,
    type VehicleStatusMessage,
    type GatewayAckMessage,
    type GatewayErrorMessage,
    type VehicleTelemetryMessage
} from "./protocol.js";

import {
    validateControlPayload,
    validateTelemetryPayload
} from "./validators.js";


const server = new WebSocketServer({
    host: "127.0.0.1",
    port: 8080,
});

let vehicleSocket: WebSocket | null = null; 
const webClients = new Map<WebSocket, string>(); 
const socketLiveness = new Map<WebSocket, boolean>();
let activeController: WebSocket | null = null; 

server.on("listening", () => {
    console.log("Gateway listening on ws://127.0.0.1:8080");
});

server.on("error", console.error); 

server.on("connection", (socket) => {
    console.log("New connection");

    socketLiveness.set(socket, true); 

    socket.on("pong", () => {
        socketLiveness.set(socket, true); 
    });

    socket.on("error", console.error); 

    socket.on("message", (data) => {
        let message; 

        try {
            message = JSON.parse(data.toString()); 
        } catch {
            console.log("Invalid JSON"); 
            sendError(socket, "Invalid JSON"); 
            return; 
        }

        switch (message.type) {
            case MessageType.DEVICE_AUTH:
                handleDeviceAuth(socket);
                return;

            case MessageType.CLIENT_AUTH:
                handleClientAuth(socket, message);
                return;

            case MessageType.CONTROL_ACQUIRE:
                handleControlAcquire(socket);
                return;

            case MessageType.CONTROL_RELEASE:
                handleControlRelease(socket);
                return;

            case MessageType.VEHICLE_CONTROL:
                handleVehicleControl(socket, message);
                return;

            case MessageType.VEHICLE_TELEMETRY:
                handleVehicleTelemetry(socket, message);
                return;

            default:
                const error = `Unsupported message type: ${message.type}`;
                console.error(error);
                sendError(socket, error);
        }
    }); 

    socket.on("close", () => {
        socketLiveness.delete(socket); 

        if (socket === activeController) {
            activeController = null; 
        }

        if (socket === vehicleSocket) {
            vehicleSocket = null; 
            console.log("Vehicle disconnected"); 

            const statusMessage: VehicleStatusMessage = {
                type: MessageType.VEHICLE_STATUS,
                payload: {
                    online: false
                }
            };

            broadcastToWebClients(statusMessage); 

            return; 
        }

        const clientId = webClients.get(socket); 
        if (clientId) {
            webClients.delete(socket); 

            console.log(`Web client disconnected: ${clientId}`); 
            return; 
        }

        console.log("Unknown connection disconnected"); 
    }); 
});

function handleDeviceAuth(socket: WebSocket): void {
    if (vehicleSocket && vehicleSocket.readyState === WebSocket.OPEN) {
        console.error("Vehicle is already registered"); 
        sendError(socket, "Vehicle is already registered"); 
        return; 
    }
            
    vehicleSocket = socket; 
            
    console.log("Vehicle registered"); 
    sendAck(socket, MessageType.DEVICE_AUTH); 

    const statusMessage: VehicleStatusMessage = {
        type: MessageType.VEHICLE_STATUS,
        payload: {
            online: true
        }
    };

    broadcastToWebClients(statusMessage); 
}

function handleClientAuth(socket: WebSocket, message: ClientAuthMessage): void {
    const clientId = message.payload?.clientId; 

    if (typeof clientId !== "string" || clientId.trim().length === 0) {
        console.log("Invalid client ID"); 
        sendError(socket, "Invalid client ID"); 
        return;
    }

    webClients.set(socket, clientId); 

    console.log(`Web client registered: ${clientId}`); 
    sendAck(socket, MessageType.CLIENT_AUTH); 

    const vehicleOnline = 
        vehicleSocket !== null && 
        vehicleSocket.readyState === WebSocket.OPEN;  

    const vehicleStatusMessage: VehicleStatusMessage = {
        type: MessageType.VEHICLE_STATUS, 
        payload: {
            online: vehicleOnline
        }
    }

    socket.send(JSON.stringify(vehicleStatusMessage)); 
}

function handleControlAcquire(socket: WebSocket): void {
    const clientId = webClients.get(socket);
    if (!clientId) {
        console.error("Control acquire rejected: sender is not a registered web client"); 
        sendError(socket, "You are not registered as an web client!"); 
        return; 
    }
    
    if (activeController) {
        console.error(`Control acquire rejected for ${clientId}: controller already exists`);
        sendError(socket, "Vehicle control is already acquired");
        return;   
    }

    activeController = socket; 
            
    sendAck(socket, MessageType.CONTROL_ACQUIRE); 
    console.log(`Control acquired by ${clientId}`); 
            
    return; 
}

function handleControlRelease(socket: WebSocket): void {
    const clientId = webClients.get(socket);

    if (!clientId) {
        console.error("Control release rejected: sender is not a registered web client");
        sendError(socket, "You are not registered as a web client");
        return;
    }

    if (socket !== activeController) {
        console.log(`The client ${clientId} tried to release the controller, but is not an active controller`); 
        sendError(socket, "You are not an active controller, thus cannot release control!"); 
        return; 
    }

    activeController = null; 

    console.log(`Control released by ${clientId}`); 
    sendAck(socket, MessageType.CONTROL_RELEASE); 

    return; 
}

function handleVehicleControl(socket: WebSocket, message: VehicleControlMessage): void {
    const clientId = webClients.get(socket); 

    if (!clientId) {
        console.error("Control rejected: sender is not a registered web client");
        sendError(socket, "Control rejected: sender is not a registered web client");  
        return; 
    }
            
    if (socket !== activeController) {
        sendError(socket, "You dont have permission to control the vehicle!"); 
        return; 
    }

    if (!vehicleSocket || vehicleSocket.readyState !== WebSocket.OPEN) {
        console.error("Control rejected: vehicle is offline"); 
        sendError(socket, "Control rejected: vehicle is offline"); 
        return; 
    }

    const payload = message.payload;
           
    const validationError = validateControlPayload(payload); 
    if (validationError) {
        console.error(validationError); 
        sendError(socket, validationError); 
        return; 
    }

    const controlPayload = payload as VehicleControlPayload;

    vehicleSocket.send(
         JSON.stringify(message)
    );

    console.log(
        `Control forwarded from ${clientId}: ` +
        `throttle=${controlPayload.throttle}, ` +
        `steering=${controlPayload.steering}, ` +
        `sequence=${controlPayload.sequence}`
    );

    return; 
}

function handleVehicleTelemetry(socket: WebSocket, message: VehicleTelemetryMessage): void {
    if (socket !== vehicleSocket) {
        console.error("Only vehicle can produce telemetry!");
        sendError(socket, "Only vehicle can produce telemetry!");  
        return; 
    }

    const validationError = validateTelemetryPayload(message.payload); 
    if (validationError) {
        console.error(validationError); 
        sendError(socket, validationError);
        return; 
    }

    broadcastToWebClients(message); 

    return; 
}

function sendAck(socket: WebSocket, messageType: string): void {
    if (socket.readyState !== WebSocket.OPEN) {
        return; 
    }

    const ackMessage : GatewayAckMessage = {
        type: MessageType.GATEWAY_ACK, 
        payload: {
            for: messageType
        }
    };

    socket.send(JSON.stringify(ackMessage)); 
}

function sendError(socket: WebSocket, errorMessage: string): void {
    if (socket.readyState !== WebSocket.OPEN) {
        return;
    }

    const message: GatewayErrorMessage = {
        type: MessageType.GATEWAY_ERROR, 
        payload: {
            message: errorMessage
        }
    };

    socket.send(JSON.stringify(message)); 
}

function broadcastToWebClients(message: object): void {
    const serializedMessage = JSON.stringify(message); 

    for (const clientSocket of webClients.keys()) {
        if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(serializedMessage); 
        }
    }
}

// server.clients contains all currently connected WebSocket clients,
// regardless of whether they are the vehicle or a web client.
const heartbeatInterval = setInterval(() => {
    for (const clientSocket of server.clients) {
        const isAlive = socketLiveness.get(clientSocket); 

        if (!isAlive) {
            console.log("Dead connection detected"); 

            socketLiveness.delete(clientSocket); 
            clientSocket.terminate(); 

            continue; 
        }

        socketLiveness.set(clientSocket, false); 
        clientSocket.ping(); 
    }
}, 10_000);

server.on("close", () => {
    clearInterval(heartbeatInterval); 
}); 