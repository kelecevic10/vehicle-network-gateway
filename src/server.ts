import WebSocket, { WebSocketServer } from "ws"
import {
    GatewayAckMessage,
    GatewayErrorMessage,
    MessageType,
    VehicleControlMessage,
    VehicleStatusMessage,
    type VehicleControlPayload
} from "./protocol.js";


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

        if (message.type === MessageType.DEVICE_AUTH) {
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

            return; 
        }

        if (message.type === MessageType.CLIENT_AUTH) {
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

            return; 
        }

        if (message.type === MessageType.CONTROL_ACQUIRE) {
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
            return; 
        }

        if (message.type === MessageType.CONTROL_RELEASE) {
            const clientId = webClients.get(socket);

            if (!clientId) {
                console.error("Control release rejected: sender is not a registered web client");
                sendError(socket, "You are not registered as a web client");
                return;
            }

            if (socket !== activeController) {
                const clientId = webClients.get(socket); 
                console.log(`The client ${clientId} tried to release the controller, but is not an active controller`); 
                sendError(socket, "You are not an active controller, thus cannot release control!"); 
                return; 
            }

            activeController = null; 
            sendAck(socket, MessageType.CONTROL_RELEASE); 

            return; 
        }

        if (message.type === MessageType.VEHICLE_CONTROL) {
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

        if (message.type === MessageType.VEHICLE_TELEMETRY) {
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

            for (let clientSocket of webClients.keys()) {
                if (clientSocket.readyState === WebSocket.OPEN)
                    clientSocket.send(JSON.stringify(message)); 
            }

            return; 
        }

        const error = `Unsupported message type: ${message.type}`;
        console.error(error);   
        sendError(socket, error);
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



function validateControlPayload(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
        return "Invalid payload";
    }

    // payload is already checked to be an object, but TypeScript still does not
    // know its structure. Treat it as a generic object with string keys and
    // unknown values, then validate each field explicitly below.
    const {throttle, steering, sequence} = payload as Record<string, unknown>;

    if (
        typeof throttle !== "number" ||
        typeof steering !== "number" ||
        !Number.isFinite(throttle) ||
        !Number.isFinite(steering)
    ) {
        return "Throttle and steering must be numbers";
    }

    if (throttle < -1 || throttle > 1 || steering < -1 || steering > 1) {
        return "Throttle and steering must be between -1 and 1";
    }

    if (
        typeof sequence !== "number" ||
        !Number.isInteger(sequence) ||
        sequence <= 0
    ) {
        return "Sequence must be a positive integer";
    }

    return null;
}

function validateTelemetryPayload(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
        return "Invalid telemetry payload";
    }

    const {batteryVoltage, speed} = payload as Record<string, unknown>;

    if (typeof batteryVoltage !== "number" || !Number.isFinite(batteryVoltage)) {
        return "Battery voltage must be a valid number";
    }

    if (batteryVoltage < 0) {
        return "Battery voltage cannot be negative";
    }

    if (typeof speed !== "number" || !Number.isFinite(speed)) {
        return "Speed must be a valid number";
    }

    return null;
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
const hearbeatInterval = setInterval(() => {
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
    clearInterval(hearbeatInterval); 
}); 