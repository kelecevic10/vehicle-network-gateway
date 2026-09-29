# Vehicle Network Gateway

A lightweight Node.js + TypeScript gateway that connects a remote vehicle with multiple web clients over WebSockets.

The gateway acts as the central communication and coordination layer between:

- one physical vehicle
- multiple web clients
- future remote-control and telemetry interfaces

It is part of a larger Raspberry Pi based RC vehicle platform.

---

## Architecture

```text
                Web Clients
                     |
                     | WebSocket
                     |
                     v
          +-----------------------+
          | Vehicle Network       |
          | Gateway               |
          |                       |
          | - connection tracking |
          | - message routing     |
          | - controller locking  |
          | - telemetry broadcast |
          | - heartbeat           |
          +-----------------------+
                     |
                     | WebSocket
                     |
                     v
              Raspberry Pi
                     |
                 C++ ECU
                     |
                 MessageBus
                     |
          Motors / Camera / Sensors
```

The Raspberry Pi initiates an outbound connection to the gateway.

This allows the vehicle to operate behind NAT, home routers or mobile networks without requiring the Pi itself to expose a public server.

---

## Current v0.1 Features

- WebSocket based bidirectional communication
- Single vehicle connection
- Multiple simultaneous web clients
- Vehicle and web-client registration
- Active controller acquire/release mechanism
- Only the active controller may send driving commands
- Vehicle control forwarding
- Vehicle telemetry broadcasting
- Vehicle online/offline status
- Structured gateway ACK and error messages
- Runtime validation of control and telemetry payloads
- WebSocket ping/pong heartbeat
- Automatic cleanup of disconnected clients
- Automatic controller release on disconnect
- Controller reset when the vehicle disconnects
- Environment-based host and port configuration

---

## Active Controller Model

Multiple users may connect to the gateway simultaneously, but only one client may control the vehicle at a time.

A client must explicitly acquire control:

```text
Client A -> control.acquire
Gateway  -> gateway.ack

Client A -> vehicle.control
Gateway  -> Vehicle
```

While Client A owns the controller lock:

```text
Client B -> control.acquire
Gateway  -> gateway.error

Client B -> vehicle.control
Gateway  -> gateway.error
```

Control can be released explicitly:

```text
Client A -> control.release
Gateway  -> gateway.ack
```

The controller lock is also automatically released if:

- the active web client disconnects
- the vehicle disconnects

A client cannot acquire control while the vehicle is offline.

---

# Protocol

All application-level messages are JSON objects containing a `type` field.

Depending on the message type, a `payload` object may also be present.

---

## Device Authentication

### `device.auth`

Sent by the vehicle after establishing its WebSocket connection.

```json
{
  "type": "device.auth"
}
```

Only one vehicle may be registered at a time.

Successful registration results in:

```json
{
  "type": "gateway.ack",
  "payload": {
    "for": "device.auth"
  }
}
```

---

## Web Client Authentication

### `client.auth`

Registers a web client with the gateway.

```json
{
  "type": "client.auth",
  "payload": {
    "clientId": "web-client-001"
  }
}
```

The `clientId` must be a non-empty string.

After successful registration the gateway:

1. sends `gateway.ack`
2. sends the current vehicle online/offline state

---

## Acquire Vehicle Control

### `control.acquire`

Requests exclusive permission to control the vehicle.

```json
{
  "type": "control.acquire"
}
```

The request succeeds only when:

- the sender is a registered web client
- the vehicle is online
- no other active controller exists

Successful request:

```json
{
  "type": "gateway.ack",
  "payload": {
    "for": "control.acquire"
  }
}
```

---

## Release Vehicle Control

### `control.release`

Releases the active controller lock.

```json
{
  "type": "control.release"
}
```

Only the current active controller may release control.

---

## Vehicle Control

### `vehicle.control`

Sent by the active controller and forwarded by the gateway to the vehicle.

```json
{
  "type": "vehicle.control",
  "payload": {
    "throttle": 0.5,
    "steering": -0.25,
    "sequence": 42
  }
}
```

### Payload

| Field | Type | Range / Meaning |
|---|---|---|
| `throttle` | number | `-1.0` to `1.0` |
| `steering` | number | `-1.0` to `1.0` |
| `sequence` | integer | positive integer |

Throttle convention:

```text
-1.0    full reverse
 0.0    neutral / stop
+1.0    full forward
```

Steering is also normalized to the range `[-1, 1]`.

The gateway validates the payload before forwarding it.

---

## Vehicle Telemetry

### `vehicle.telemetry`

Sent by the vehicle and broadcast to all registered web clients.

```json
{
  "type": "vehicle.telemetry",
  "payload": {
    "batteryVoltage": 11.8,
    "speed": 10
  }
}
```

Only the registered vehicle connection is allowed to produce telemetry.

Current telemetry fields:

| Field | Type | Meaning |
|---|---|---|
| `batteryVoltage` | number | measured battery voltage |
| `speed` | number | vehicle speed |

The telemetry schema is intentionally minimal in v0.1 and will be expanded later.

---

## Vehicle Status

### `vehicle.status`

Sent by the gateway to web clients when the vehicle connects or disconnects.

```json
{
  "type": "vehicle.status",
  "payload": {
    "online": true
  }
}
```

Newly registered web clients also immediately receive the current vehicle status.

---

## Gateway ACK

### `gateway.ack`

Confirms successful processing of selected protocol operations.

```json
{
  "type": "gateway.ack",
  "payload": {
    "for": "control.acquire"
  }
}
```

ACK messages are currently used for operations such as:

- `device.auth`
- `client.auth`
- `control.acquire`
- `control.release`

High-frequency messages such as vehicle control and telemetry are intentionally not acknowledged individually.

---

## Gateway Error

### `gateway.error`

Returned when the gateway rejects a request or receives invalid data.

```json
{
  "type": "gateway.error",
  "payload": {
    "message": "Vehicle control is already acquired"
  }
}
```

Possible causes include:

- invalid JSON
- unsupported message type
- invalid payload
- unauthorized control attempt
- vehicle offline
- duplicate vehicle connection
- controller already acquired

---

# Connection Liveness

The gateway uses WebSocket ping/pong control frames to detect dead connections.

Conceptually:

```text
Gateway
   |
   | ping
   v
Client
   |
   | pong
   v
Gateway
```

Every connected socket is periodically checked.

If a connection fails to respond to the heartbeat, the gateway terminates it and normal disconnect cleanup is performed.

Heartbeat frames are part of the WebSocket protocol and are separate from the application JSON protocol described above.

---

# Configuration

Runtime configuration is loaded from environment variables.

Example `.env`:

```env
HOST=127.0.0.1
PORT=8080
```

The repository contains `.env.example` as a template.

The real `.env` file should not be committed.

---

# Running Locally

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env
```

Start the gateway:

```bash
npm run dev
```

Run TypeScript type checking:

```bash
npm run typecheck
```

Default development address:

```text
ws://127.0.0.1:8080
```

---

# Development Clients

The repository contains temporary development clients used for gateway testing:

```text
fake-client.ts
fake-vehicle.ts
```

The fake vehicle simulates the future Raspberry Pi C++ networking module.

The fake web client simulates the future browser / Next.js application.

These allow the entire gateway protocol to be tested before integration with physical hardware.

---

# Future Architecture

The gateway is intended to remain the central coordination layer, but not necessarily transport every latency-sensitive byte in the final system.

The planned architecture uses a hybrid networking approach.

```text
                         Browser
                    /       |       \
                 HTTP   WebSocket   WebRTC
                   |        |          |
                   v        v          |
                    Gateway            |
                      |                |
                      |                |
                      +------ Pi ------+
```

Expected responsibilities:

### HTTP

For request/response operations that are not latency-sensitive.

### WebSocket

For:

- connection management
- telemetry
- status updates
- logs
- controller coordination
- authentication
- WebRTC signaling

### WebRTC

Potential future use for:

- low-latency control
- direct browser-to-vehicle communication
- real-time camera/video streaming

The exact transport for real-time vehicle control will be selected after measuring WebSocket latency and jitter on the real system.

---

# Safety

The gateway controller lock determines **who is allowed to drive**.

Physical safety will additionally be handled locally on the Raspberry Pi.

A future C++ dead-man mechanism will stop the vehicle automatically if valid control commands stop arriving for a defined period.

This local safety mechanism will operate independently of the gateway and network connection.

---

# Planned Post-v0.1 Work

- Raspberry Pi C++ networking module
- reconnect and exponential backoff
- local control dead-man timeout
- real device authentication
- user authentication and authorization
- WSS / TLS
- control latency and jitter measurements
- WebRTC signaling
- WebRTC camera streaming
- possible WebRTC DataChannel control
- HTTP health endpoint
- structured production logging
- deployment
- rate limiting
- protocol versioning