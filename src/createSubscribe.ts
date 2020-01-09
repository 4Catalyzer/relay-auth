import { Observable, RequestParameters, Variables } from 'relay-runtime';
import io from 'socket.io-client';

enum _APOLLO_TYPES {
  GQL_CONNECTION_INIT = 'connection_init', // Client -> Server
  GQL_CONNECTION_ACK = 'connection_ack', // Server -> Client
  GQL_CONNECTION_ERROR = 'connection_error', // Server -> Client

  // NOTE: The keep alive message type does not follow the standard due to connection optimizations
  GQL_CONNECTION_KEEP_ALIVE = 'ka', // Server -> Client

  GQL_CONNECTION_TERMINATE = 'connection_terminate', // Client -> Server
  GQL_START = 'start', // Client -> Server
  GQL_DATA = 'data', // Server -> Client
  GQL_ERROR = 'error', // Server -> Client
  GQL_COMPLETE = 'complete', // Server -> Client
  GQL_STOP = 'stop', // Client -> Server
}

export interface SubscriptionOptions {
  url?: string;
  token?: string;
  maxSubscriptions?: number;
}

export default function createSubscribe({
  token,
  url = '/socket.io/graphql',
  maxSubscriptions = 200,
}: SubscriptionOptions = {}) {
  let nextSubscriptionId = 0;
  const subscriptions = new Map();

  let origin, path;
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
    path = parsed.pathname;
  } catch (err) {
    origin = window.location.origin;
    path = url;
  }

  const socket = io(origin, { path, transports: ['websocket'] });

  function emitTransient(event: string, ...args: any[]) {
    // For transient state management, we re-emit on reconnect anyway, so no
    // need to use the send buffer.
    if (!socket.connected) {
      return;
    }

    socket.emit(event, ...args);
  }

  function subscribe(id: number, { query, variables }: any) {
    emitTransient('subscribe', { id, query, variables });
  }

  socket
    .on('connect', () => {
      if (token) {
        emitTransient('authenticate', token);
      }

      subscriptions.forEach((subscription, id) => {
        subscribe(id, subscription);
      });
    })
    .on('subscription update', ({ id, ...payload }: any) => {
      const subscription = subscriptions.get(id);
      if (!subscription) {
        return;
      }

      subscription.sink.next(payload);
    });

  function subscribeFn<T>(operation: RequestParameters, variables: Variables) {
    return Observable.create<T>(sink => {
      const id = nextSubscriptionId++;

      if (subscriptions.size >= maxSubscriptions) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('subscription limit reached');
        }
        return undefined;
      }

      const subscription = {
        sink,
        query: operation.text,
        variables,
      };

      subscriptions.set(id, subscription);
      subscribe(id, subscription);

      return () => {
        emitTransient('unsubscribe', id);
        subscriptions.delete(id);
      };
    });
  }

  subscribeFn.socket = socket;
  subscribeFn.close = () => {
    socket.disconnect();

    subscriptions.forEach(({ sink }) => {
      sink.complete();
    });
  };

  return subscribeFn;
}
