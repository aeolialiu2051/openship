export interface UseLogStreamReturn {
  connect: (target: string) => Promise<void>;
  disconnect: () => void;
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
}

export type LogStreamState = Pick<
  UseLogStreamReturn,
  "isConnected" | "isConnecting" | "error"
>;

/**
 * Keep the imperative log-stream handle stable across connection-state renders.
 * Consumers commonly use `connect`/`disconnect` in effect dependencies; replacing
 * the whole handle when `isConnected` changes makes those effects tear down the
 * stream immediately after it opens.
 */
export function createLogStreamHandle(
  connect: UseLogStreamReturn["connect"],
  disconnect: UseLogStreamReturn["disconnect"],
  stateRef: { current: LogStreamState },
): UseLogStreamReturn {
  return {
    connect,
    disconnect,
    get isConnected() {
      return stateRef.current.isConnected;
    },
    get isConnecting() {
      return stateRef.current.isConnecting;
    },
    get error() {
      return stateRef.current.error;
    },
  };
}
