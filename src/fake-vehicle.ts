import WebSocket from "ws";

const socket = new WebSocket("ws://127.0.0.1:8080");

socket.on("open", () => {
    console.log("Connected to gateway");

    socket.send(JSON.stringify({
        type: "device.auth"
    }));

});

socket.on("close", () => {
    console.log("Disconnected from gateway");
});

socket.on("error", console.error);

socket.on("message", (data) => {
    const message = JSON.parse(data.toString());

    if (message.type === "vehicle.control") {
        console.log(
            `Control received:
            throttle = ${message.payload.throttle}
            steering = ${message.payload.steering}
            sequence = ${message.payload.sequence}`
        );

        setTimeout(() => {
            socket.send(JSON.stringify({
                type: "vehicle.telemetry",
                payload: {
                    batteryVoltage: 11.8,
                    speed: 10
                }
            }));

            console.log("Telemetry sent");
        }, 1000);
    }
});