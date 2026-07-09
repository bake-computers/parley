import { ConnectError } from "@connectrpc/connect";
import { err, ok, type Result } from "neverthrow";
import type {
  GetQueueStatusRequest,
  GetQueueStatusResponse,
  JoinQueueRequest,
  JoinQueueResponse,
  LeaveQueueRequest,
  LeaveQueueResponse,
} from "@parley/proto";

type MatchmakingClient = {
  getQueueStatus: (request: GetQueueStatusRequest) => Promise<GetQueueStatusResponse>;
  joinQueue: (request: JoinQueueRequest) => Promise<JoinQueueResponse>;
  leaveQueue: (request: LeaveQueueRequest) => Promise<LeaveQueueResponse>;
};

function wrap<T>(request: Promise<T>): Promise<Result<T, ConnectError>> {
  return request.then(
    (response) => ok(response),
    (cause: unknown) =>
      err(cause instanceof ConnectError ? cause : new ConnectError(String(cause), 13, {})),
  );
}

export function invokeGetQueueStatus(
  client: MatchmakingClient,
  request: GetQueueStatusRequest,
): Promise<Result<GetQueueStatusResponse, ConnectError>> {
  return wrap(client.getQueueStatus(request));
}

export function invokeJoinQueue(
  client: MatchmakingClient,
  request: JoinQueueRequest,
): Promise<Result<JoinQueueResponse, ConnectError>> {
  return wrap(client.joinQueue(request));
}

export function invokeLeaveQueue(
  client: MatchmakingClient,
  request: LeaveQueueRequest,
): Promise<Result<LeaveQueueResponse, ConnectError>> {
  return wrap(client.leaveQueue(request));
}

