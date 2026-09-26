import WebSocket from "ws";

const socket = new WebSocket("ws://127.0.0.1:8080");

let sequence = 1;

function sendControl(throttle: number, steering: number) {
    socket.send(JSON.stringify({
        type: "vehicle.control",
        payload: {
            throttle,
            steering,
            sequence
        }
    }));

    console.log(`Control sent: throttle=${throttle}, steering=${steering}, sequence=${sequence}`);
    sequence++;
}

socket.on("open", () => {
    console.log("Connected to gateway");

    socket.send(JSON.stringify({
        type: "client.auth",
        payload: {
            clientId: "web-client-001"
        }
    }));

    console.log("Client auth sent");

    setTimeout(() => {
        sendControl(0.5, 0.65);
    }, 2000);
});


socket.on("message", (data) => {
    let message;

    try {
        message = JSON.parse(data.toString());
    } catch {
        console.error("Invalid message received from gateway");
        return;
    }

    if (message.type === "vehicle.telemetry") {
        const { batteryVoltage, speed } = message.payload;

        console.log(
            `Telemetry received: batteryVoltage=${batteryVoltage}, speed=${speed}`
        );

        return;
    }

    console.log("Message received from gateway:", message);
});


socket.on("close", () => {
    console.log("Disconnected from gateway");
});

socket.on("error", console.error);