export function validateControlPayload(payload: unknown): string | null {
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

export function validateTelemetryPayload(payload: unknown): string | null {
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