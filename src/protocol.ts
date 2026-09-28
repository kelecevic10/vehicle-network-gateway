
export const MessageType = {
    DEVICE_AUTH: "device.auth",
    CLIENT_AUTH: "client.auth",
    VEHICLE_CONTROL: "vehicle.control",
    VEHICLE_TELEMETRY: "vehicle.telemetry", 
    
    GATEWAY_ACK: "gateway.ack", 
    GATEWAY_ERROR: "gateway.error", 
} as const; 

export type ClientAuthPayload = {
    clientId: string;
}; 

export type VehicleControlPayload = {
    throttle: number;
    steering: number;
    sequence: number;
};

export type VehicleTelemetryPayload = {
    batteryVoltage: number;
    speed: number;
};

export type DeviceAuthMessage = {
    type: typeof MessageType.DEVICE_AUTH;
};

export type ClientAuthMessage = {
    type: typeof MessageType.CLIENT_AUTH;
    payload: ClientAuthPayload; 
}; 

export type VehicleControlMessage = {
    type: typeof MessageType.VEHICLE_CONTROL;
    payload: VehicleControlPayload;
};

export type VehicleTelemetryMessage = {
    type: typeof MessageType.VEHICLE_TELEMETRY;
    payload: VehicleTelemetryPayload;
};

export type GatewayAckPayload = {
    for: string; 
};

export type GatewayErrorPayload = {
    message: string; 
}; 

export type GatewayAckMessage = {
    type: typeof MessageType.GATEWAY_ACK; 
    payload: GatewayAckPayload;
}; 

export type GatewayErrorMessage = {
    type: typeof MessageType.GATEWAY_ERROR;
    payload: GatewayErrorPayload;
}; 