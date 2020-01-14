import {
  RelayObservable,
  Subscription,
} from 'relay-runtime/lib/network/RelayObservable';
// @ts-ignore
import { reset, serverEmit } from 'socket.io-client';

import createSubscribe, {
  SocketioSubscriptionClient,
} from '../src/createSubscribe';

describe('createSubscribe', () => {
  const subs = [] as Subscription[];

  jest.useFakeTimers();

  function run(...obs: RelayObservable<any>[]) {
    obs.forEach(o => {
      subs.push(o.subscribe({}));
    });
  }

  beforeEach(() => {
    reset();
  });

  afterEach(() => {
    subs.forEach(s => s.unsubscribe());
    subs.length = 1;
  });

  it('should connect', () => {
    const { socket } = createSubscribe().client as SocketioSubscriptionClient;

    jest.runOnlyPendingTimers();

    expect(socket.connected).toEqual(true);
    expect(serverEmit).toHaveBeenCalledTimes(1);

    // @ts-ignore
    expect(socket.origin).toEqual('http://localhost');
    // @ts-ignore
    expect(socket.opts.path).toEqual('/socket.io/graphql');
  });

  it('should handle relative path', () => {
    const { socket } = createSubscribe({ url: '/graphql' })
      .client as SocketioSubscriptionClient;

    // @ts-ignore
    expect(socket.origin).toEqual('http://localhost');
    // @ts-ignore
    expect(socket.opts.path).toEqual('/graphql');
  });

  it('should parse absolute url', () => {
    const { socket } = createSubscribe({ url: 'https://foo.com/gql' })
      .client as SocketioSubscriptionClient;

    // @ts-ignore
    expect(socket.origin).toEqual('https://foo.com');
    // @ts-ignore
    expect(socket.opts.path).toEqual('/gql');
  });

  it('should authenticate', () => {
    const token = 'foo';
    const { socket } = createSubscribe({ token })
      .client as SocketioSubscriptionClient;

    jest.runAllTimers();

    expect(socket.emit).toHaveBeenCalledWith('authenticate', token);
  });

  it('should immediately emit pending subscriptions', () => {
    const subscribe = createSubscribe();
    const client = subscribe.client as SocketioSubscriptionClient;
    run(
      subscribe(
        {
          id: '1',
          name: 'foo',
          text: 'subscription foo',
          operationKind: 'subscription',
          metadata: {},
        },
        {},
      ),
      subscribe(
        {
          id: '2',
          name: 'bar',
          text: 'subscription bar',
          operationKind: 'subscription',
          metadata: {},
        },
        {},
      ),
    );

    expect(client.socket.emit).not.toHaveBeenCalledWith('subscribe');

    jest.runAllTimers();

    expect(client.socket.emit).toHaveBeenCalledWith('subscribe', {
      id: 0,
      query: 'subscription foo',
      variables: {},
    });
    expect(client.socket.emit).toHaveBeenLastCalledWith('subscribe', {
      id: 1,
      query: 'subscription bar',
      variables: {},
    });
  });

  it('should subscribe', () => {
    const subscribe = createSubscribe();

    const client = subscribe.client as SocketioSubscriptionClient;

    jest.runAllTimers();

    run(
      subscribe(
        {
          id: '1',
          name: 'foo',
          text: 'subscription foo',
          operationKind: 'subscription',
          metadata: {},
        },
        {},
      ),
    );

    expect(client.socket.emit).toHaveBeenLastCalledWith('subscribe', {
      id: 0,
      query: 'subscription foo',
      variables: {},
    });
  });

  it('should match subs by id', () => {
    const subscribe = createSubscribe();
    const client = subscribe.client as SocketioSubscriptionClient;

    const observer = {
      next: jest.fn(),
      complete: jest.fn(),
    };

    jest.runAllTimers();

    subscribe(
      {
        id: '1',
        name: 'foo',
        text: 'subscription foo',
        operationKind: 'subscription',
        metadata: {},
      },
      {},
    ).subscribe(observer);

    serverEmit('subscription update', { id: 0, data: 'foo' });

    serverEmit('subscription update', { id: 0, data: 'bar' });

    jest.runAllTimers();

    expect(client.socket.emit).toHaveBeenCalledWith('subscribe', {
      id: 0,
      query: 'subscription foo',
      variables: {},
    });

    expect(observer.next).toHaveBeenCalledWith({ data: 'foo' });
    expect(observer.next).toHaveBeenLastCalledWith({ data: 'bar' });
  });

  it('should clean up', () => {
    const subscribe = createSubscribe();
    const client = subscribe.client as SocketioSubscriptionClient;

    const observer = {
      next: jest.fn(),
      complete: jest.fn(),
    };

    jest.runAllTimers();

    subscribe(
      {
        id: '1',
        name: 'foo',
        text: 'subscription foo',
        operationKind: 'subscription',
        metadata: {},
      },
      {},
    ).subscribe(observer);

    serverEmit('subscription update', { id: 0, data: 'foo' });

    jest.runAllTimers();

    subscribe.close();

    serverEmit('subscription update', { id: 0, data: 'bar' });

    jest.runAllTimers();

    expect(client.socket.emit).toHaveBeenCalledWith('subscribe', {
      id: 0,
      query: 'subscription foo',
      variables: {},
    });

    expect(observer.next).toHaveBeenLastCalledWith({ data: 'foo' });
  });
});
