export {
  JsonRpcGatewayClient,
  type ConnectionState,
  type GatewayClientOptions,
  type GatewayEvent,
  type GatewayEventName,
  type GatewayRequestId,
  type JsonRpcErrorPayload,
  type JsonRpcFrame,
  type WebSocketLike,
  JsonRpcGatewayError,
} from "./json-rpc-gateway";
export {
  GatewayReauthRequiredError,
  buildHermesWebSocketUrl,
  isGatewayReauthRequired,
  resolveGatewayWsUrl,
  type GatewayAuthMode,
  type GatewayWsConnection,
  type HermesWebSocketUrlOptions,
  type ResolveGatewayWsUrlDeps,
  type WebSocketAuthParam,
} from "./websocket-url";
