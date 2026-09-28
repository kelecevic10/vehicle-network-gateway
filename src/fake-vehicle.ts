import WebSocket from "ws";

import {
    MessageType,
    type DeviceAuthMessage,
    type VehicleControlPayload,
    type VehicleTelemetryMessage,
    type GatewayAckPayload,
    type GatewayErrorPayload
} from "./protocol.js";


const socket = new WebSocket("ws://127.0.0.1:8080");


socket.on("open", () => {
    console.log("Connected to gateway");

    const authMessage: DeviceAuthMessage = {
        type: MessageType.DEVICE_AUTH
    };

    socket.send(JSON.stringify(authMessage));

    console.log("Device auth sent");
});


socket.on("message", (data) => {
    let message;

    try {
        message = JSON.parse(data.toString());
    } catch {
        console.error(
            "Invalid message received from gateway"
        );
        return;
    }


    if (message.type === MessageType.GATEWAY_ACK) {
        const payload =
            message.payload as GatewayAckPayload;

        console.log(
            `Gateway ACK received for: ${payload.for}`
        );

        return;
    }


    if (message.type === MessageType.GATEWAY_ERROR) {
        const payload =
            message.payload as GatewayErrorPayload;

        console.error(
            `Gateway error: ${payload.message}`
        );

        return;
    }


    if (message.type === MessageType.VEHICLE_CONTROL) {
        const payload =
            message.payload as VehicleControlPayload;

        console.log(
            `Control received:
            throttle = ${payload.throttle}
            steering = ${payload.steering}
            sequence = ${payload.sequence}`
        );

        setTimeout(() => {
            const telemetryMessage: VehicleTelemetryMessage = {
                type: MessageType.VEHICLE_TELEMETRY,
                payload: {
                    batteryVoltage: 11.8,
                    speed: 10
                }
            };

            socket.send(
                JSON.stringify(telemetryMessage)
            );

            console.log("Telemetry sent");
        }, 1000);

        return;
    }


    console.log(
        "Message received from gateway:",
        message
    );
});


socket.on("close", () => {
    console.log("Disconnected from gateway");
});


socket.on("error", console.error);