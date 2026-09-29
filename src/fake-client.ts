import WebSocket from "ws";

import {
    MessageType,
    type ClientAuthMessage,
    type ControlAcquireMessage,
    type ControlReleaseMessage,
    type VehicleControlMessage,
    type VehicleTelemetryPayload,
    type VehicleStatusPayload,
    type GatewayAckPayload,
    type GatewayErrorPayload
} from "./protocol.js";


const socket = new WebSocket("ws://127.0.0.1:8080");

const clientId = process.argv[2] ?? "web-client-001";

let sequence = 1;


function acquireControl() {
    const message: ControlAcquireMessage = {
        type: MessageType.CONTROL_ACQUIRE
    };

    socket.send(JSON.stringify(message));

    console.log("Control acquire requested");
}


function releaseControl() {
    const message: ControlReleaseMessage = {
        type: MessageType.CONTROL_RELEASE
    };

    socket.send(JSON.stringify(message));

    console.log("Control release requested");
}


function sendControl(
    throttle: number,
    steering: number
) {
    const message: VehicleControlMessage = {
        type: MessageType.VEHICLE_CONTROL,
        payload: {
            throttle,
            steering,
            sequence
        }
    };

    socket.send(JSON.stringify(message));

    console.log(
        `Control sent: throttle=${throttle}, ` +
        `steering=${steering}, ` +
        `sequence=${sequence}`
    );

    sequence++;
}


socket.on("open", () => {
    console.log("Connected to gateway");

    const authMessage: ClientAuthMessage = {
        type: MessageType.CLIENT_AUTH,
        payload: {
            clientId
        }
    };

    socket.send(JSON.stringify(authMessage));

    console.log(`Client auth sent: ${clientId}`);
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


        if (payload.for === MessageType.CLIENT_AUTH) {
            acquireControl();
            return;
        }


        if (payload.for === MessageType.CONTROL_ACQUIRE) {
            setTimeout(() => {
                sendControl(0.5, 0.65);
            }, 2000);

            return;
        }


        if (payload.for === MessageType.CONTROL_RELEASE) {
            console.log("Control successfully released");
            return;
        }


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


    if (message.type === MessageType.VEHICLE_TELEMETRY) {
        const payload =
            message.payload as VehicleTelemetryPayload;

        console.log(
            `Telemetry received: ` +
            `batteryVoltage=${payload.batteryVoltage}, ` +
            `speed=${payload.speed}`
        );

        return;
    }


    if (message.type === MessageType.VEHICLE_STATUS) {
        const payload =
            message.payload as VehicleStatusPayload;

        console.log(
            `Vehicle online status: ${payload.online}`
        );

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