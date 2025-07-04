/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { Client } from '@elastic/elasticsearch';
import type { estypes } from '@elastic/elasticsearch';
import _ from 'lodash';
import { first } from 'rxjs';

import type { TaskInstance, SerializedConcreteTaskInstance } from './task';
import { TaskStatus, TaskLifecycleResult } from './task';
import type { ElasticsearchClientMock } from '@kbn/core/server/mocks';
import {
  coreMock,
  elasticsearchServiceMock,
  httpServerMock,
  savedObjectsServiceMock,
} from '@kbn/core/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { SearchOpts, AggregationOpts } from './task_store';
import { TaskStore, taskInstanceToAttributes } from './task_store';
import { savedObjectsRepositoryMock } from '@kbn/core/server/mocks';
import type { SavedObjectAttributes } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { TaskTypeDictionary } from './task_type_dictionary';
import { mockLogger } from './test_utils';
import { AdHocTaskCounter } from './lib/adhoc_task_counter';
import { asErr, asOk } from './lib/result_type';
import type { UpdateByQueryResponse } from '@elastic/elasticsearch/lib/api/types';
import { MsearchError } from './lib/msearch_error';
import { getApiKeyAndUserScope } from './lib/api_key_utils';
import type {
  EncryptedSavedObjectsClient,
  EncryptedSavedObjectsClientOptions,
} from '@kbn/encrypted-saved-objects-shared';
import { TaskValidator } from './task_validator';

let mockGetValidatedTaskInstanceFromReading: jest.SpyInstance;
let mockGetValidatedTaskInstanceForUpdating: jest.SpyInstance;

jest.mock('./lib/api_key_utils', () => ({
  getApiKeyAndUserScope: jest.fn(),
}));

function createEncryptedSavedObjectsClientMock(opts?: EncryptedSavedObjectsClientOptions) {
  return {
    getDecryptedAsInternalUser: jest.fn(),
    createPointInTimeFinderDecryptedAsInternalUser: jest.fn((findOptions, deps) =>
      savedObjectsClientMock.create().createPointInTimeFinder(findOptions, deps)
    ),
  } as unknown as jest.Mocked<EncryptedSavedObjectsClient>;
}

const savedObjectsClient = savedObjectsRepositoryMock.create();
const scopedSavedObjectsClient = savedObjectsRepositoryMock.create();
const esoClient = createEncryptedSavedObjectsClientMock();

const serializer = savedObjectsServiceMock.createSerializer();
const adHocTaskCounter = new AdHocTaskCounter();

const randomId = () => `id-${_.random(1, 20)}`;

const coreStart = coreMock.createStart();

beforeEach(() => {
  jest.resetAllMocks();

  mockGetValidatedTaskInstanceFromReading = jest
    .spyOn(TaskValidator.prototype, 'getValidatedTaskInstanceFromReading')
    .mockImplementation((task) => task);

  mockGetValidatedTaskInstanceForUpdating = jest
    .spyOn(TaskValidator.prototype, 'getValidatedTaskInstanceForUpdating')
    .mockImplementation((task) => task);
});

const mockedDate = new Date('2019-02-12T21:01:22.479Z');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).Date = class Date {
  constructor() {
    return mockedDate;
  }

  static now() {
    return mockedDate.getTime();
  }
};

const taskDefinitions = new TaskTypeDictionary(mockLogger());
taskDefinitions.registerTaskDefinitions({
  report: {
    title: 'report',
    stateSchemaByVersion: {
      1: {
        schema: schema.object({
          foo: schema.string(),
        }),
        up: (doc) => doc,
      },
    },
    createTaskRunner: jest.fn(),
  },
  dernstraight: {
    title: 'dernstraight',
    createTaskRunner: jest.fn(),
  },
  yawn: {
    title: 'yawn',
    createTaskRunner: jest.fn(),
  },
});

describe('TaskStore', () => {
  describe('schedule', () => {
    let store: TaskStore;

    beforeEach(() => {
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        canEncryptSavedObjects: true,
        getIsSecurityEnabled: () => true,
      });

      store.registerEncryptedSavedObjectsClient(esoClient);
    });

    afterEach(() => {
      adHocTaskCounter.reset();
      jest.resetAllMocks();
    });

    async function testSchedule(task: unknown, options?: Record<string, unknown>) {
      savedObjectsClient.create.mockImplementation(async (type: string, attributes: unknown) => ({
        id: 'testid',
        type,
        attributes,
        references: [],
        version: '123',
      }));
      const result = await store.schedule(task as TaskInstance, options);

      expect(savedObjectsClient.create).toHaveBeenCalledTimes(1);

      return result;
    }

    test('serializes the params and state', async () => {
      const task = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        traceparent: 'apmTraceparent',
      };
      const result = await testSchedule(task);

      expect(savedObjectsClient.create).toHaveBeenCalledWith(
        'task',
        {
          attempts: 0,
          schedule: undefined,
          params: '{"hello":"world"}',
          retryAt: null,
          runAt: '2019-02-12T21:01:22.479Z',
          scheduledAt: '2019-02-12T21:01:22.479Z',
          scope: undefined,
          startedAt: null,
          state: '{"foo":"bar"}',
          status: 'idle',
          taskType: 'report',
          user: undefined,
          traceparent: 'apmTraceparent',
          partition: 225,
        },
        {
          id: 'id',
          refresh: false,
        }
      );

      expect(result).toEqual({
        id: 'testid',
        attempts: 0,
        schedule: undefined,
        params: { hello: 'world' },
        retryAt: null,
        runAt: mockedDate,
        scheduledAt: mockedDate,
        scope: undefined,
        startedAt: null,
        state: { foo: 'bar' },
        status: 'idle',
        taskType: 'report',
        user: undefined,
        version: '123',
        traceparent: 'apmTraceparent',
        partition: 225,
      });
    });

    test('returns a concrete task instance', async () => {
      const task = {
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
      };
      const result = await testSchedule(task);

      expect(result).toMatchObject({
        ...task,
        id: 'testid',
      });
    });

    test('sets runAt to now if not specified', async () => {
      await testSchedule({ taskType: 'dernstraight', params: {}, state: {} });
      expect(savedObjectsClient.create).toHaveBeenCalledTimes(1);
      const attributes = savedObjectsClient.create.mock
        .calls[0][1] as SerializedConcreteTaskInstance;
      expect(new Date(attributes.runAt as string).getTime()).toEqual(mockedDate.getTime());
    });

    test('ensures params and state are not null', async () => {
      await testSchedule({ taskType: 'yawn' });
      expect(savedObjectsClient.create).toHaveBeenCalledTimes(1);
      const attributes = savedObjectsClient.create.mock
        .calls[0][1] as SerializedConcreteTaskInstance;
      expect(attributes.params).toEqual('{}');
      expect(attributes.state).toEqual('{}');
    });

    test('schedule a task without API key if request is provided but security disabled', async () => {
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        canEncryptSavedObjects: true,
        getIsSecurityEnabled: () => false,
      });

      store.registerEncryptedSavedObjectsClient(esoClient);

      const task = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        traceparent: 'apmTraceparent',
      };

      const request = httpServerMock.createKibanaRequest();

      savedObjectsClient.create.mockImplementation(async (type: string, attributes: unknown) => ({
        id: 'testid',
        type,
        attributes,
        references: [],
        version: '123',
      }));

      await store.schedule(task as TaskInstance, { request });

      expect(savedObjectsClient.create).toHaveBeenCalledWith(
        'task',
        {
          attempts: 0,
          params: '{"hello":"world"}',
          retryAt: null,
          runAt: '2019-02-12T21:01:22.479Z',
          scheduledAt: '2019-02-12T21:01:22.479Z',
          startedAt: null,
          state: '{"foo":"bar"}',
          status: 'idle',
          taskType: 'report',
          traceparent: 'apmTraceparent',
          partition: 225,
        },
        {
          id: 'id',
          refresh: false,
        }
      );
    });

    test('schedule a task with API key if request is provided', async () => {
      const task = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        traceparent: 'apmTraceparent',
      };

      const mockApiKey = Buffer.from('apiKeyId:apiKey').toString('base64');

      const mockUserScope = {
        apiKeyId: 'apiKeyId',
        apiKeyCreatedBy: 'testUser',
        spaceId: 'testSpace',
      };

      const request = httpServerMock.createKibanaRequest();
      const apiKeyAndUserScopeMap = new Map();
      apiKeyAndUserScopeMap.set('id', {
        apiKey: mockApiKey,
        userScope: mockUserScope,
      });
      (getApiKeyAndUserScope as jest.Mock).mockResolvedValueOnce(apiKeyAndUserScopeMap);
      coreStart.savedObjects.getScopedClient.mockReturnValueOnce(scopedSavedObjectsClient);

      scopedSavedObjectsClient.create.mockImplementation(
        async (type: string, attributes: unknown) => ({
          id: 'testid',
          type,
          attributes,
          references: [],
          version: '123',
        })
      );

      const result = await store.schedule(task as TaskInstance, { request });

      expect(scopedSavedObjectsClient.create).toHaveBeenCalledWith(
        'task',
        {
          attempts: 0,
          params: '{"hello":"world"}',
          retryAt: null,
          runAt: '2019-02-12T21:01:22.479Z',
          scheduledAt: '2019-02-12T21:01:22.479Z',
          startedAt: null,
          state: '{"foo":"bar"}',
          status: 'idle',
          taskType: 'report',
          traceparent: 'apmTraceparent',
          partition: 225,
          apiKey: mockApiKey,
          userScope: mockUserScope,
        },
        {
          id: 'id',
          refresh: false,
        }
      );

      expect(getApiKeyAndUserScope).toHaveBeenCalledWith([task], request, coreStart.security);

      expect(savedObjectsClient.create).not.toHaveBeenCalled();

      expect(result).toEqual({
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        traceparent: 'apmTraceparent',
        attempts: 0,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        runAt: mockedDate,
        status: 'idle',
        partition: 225,
        apiKey: mockApiKey,
        userScope: mockUserScope,
        id: 'testid',
        version: '123',
      });
    });

    test('errors when scheduling a task with API key if unable to encrypt SO', async () => {
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        canEncryptSavedObjects: false,
        getIsSecurityEnabled: () => true,
      });

      const task = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        traceparent: 'apmTraceparent',
      };

      const request = httpServerMock.createKibanaRequest();

      await expect(store.schedule(task as TaskInstance, { request })).rejects.toThrow(
        'Unable to schedule task(s) with API keys because the Encrypted Saved Objects plugin has not been registered or is missing encryption key.'
      );
    });

    test('errors if the task type is unknown', async () => {
      await expect(testSchedule({ taskType: 'nope', params: {}, state: {} })).rejects.toThrow(
        /Unsupported task type "nope"/i
      );
    });

    test('errors if API key could not be created', async () => {
      const task = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        traceparent: 'apmTraceparent',
      };

      (getApiKeyAndUserScope as jest.Mock).mockRejectedValueOnce(
        new Error('Something went wrong!')
      );

      const request = httpServerMock.createKibanaRequest();

      await expect(store.schedule(task as TaskInstance, { request })).rejects.toThrow(
        'Something went wrong!'
      );

      expect(getApiKeyAndUserScope).toHaveBeenCalled();
    });

    test('pushes error from saved objects client to errors$', async () => {
      const task: TaskInstance = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
      };

      const firstErrorPromise = store.errors$.pipe(first()).toPromise();
      savedObjectsClient.create.mockRejectedValue(new Error('Failure'));
      await expect(store.schedule(task)).rejects.toThrowErrorMatchingInlineSnapshot(`"Failure"`);
      expect(await firstErrorPromise).toMatchInlineSnapshot(`[Error: Failure]`);
    });

    test('increments adHocTaskCounter', async () => {
      const task: TaskInstance = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
      };

      await testSchedule(task);
      expect(adHocTaskCounter.count).toEqual(1);
    });

    test('throws an error when an invalid interval is provided', async () => {
      mockGetValidatedTaskInstanceFromReading.mockRestore();
      mockGetValidatedTaskInstanceForUpdating.mockRestore();

      const task = {
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        schedule: { interval: 'invalid-interval' },
      };
      await expect(testSchedule(task)).rejects.toThrowError(
        `[TaskValidator] Invalid interval "invalid-interval". Interval must be of the form "{number}{cadence}" where number is an integer. Example: 5m.`
      );
    });

    test('does not increment adHocTaskCounter if the task is recurring', async () => {
      const task: TaskInstance = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        schedule: { interval: '1m' },
      };

      await testSchedule(task);
      expect(adHocTaskCounter.count).toEqual(0);
    });
  });

  describe('fetch', () => {
    let store: TaskStore;
    let esClient: ReturnType<typeof elasticsearchServiceMock.createClusterClient>['asInternalUser'];
    let childEsClient: ReturnType<
      typeof elasticsearchServiceMock.createClusterClient
    >['asInternalUser'];

    beforeAll(() => {
      esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      childEsClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      esClient.child.mockReturnValue(childEsClient as unknown as Client);
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });
    });

    async function testFetch(
      opts?: SearchOpts,
      hits: Array<estypes.SearchHit<unknown>> = [],
      limitResponse: boolean = false
    ) {
      childEsClient.search.mockResponse({
        hits: { hits, total: hits.length },
      } as estypes.SearchResponse);

      const result = await store.fetch(opts, limitResponse);

      expect(childEsClient.search).toHaveBeenCalledTimes(1);

      return {
        result,
        args: childEsClient.search.mock.calls[0][0],
      };
    }

    test('empty call filters by type, sorts by runAt and id', async () => {
      const { args } = await testFetch();
      expect(args).toMatchObject({
        index: 'tasky',
        sort: [{ 'task.runAt': 'asc' }],
        query: { term: { type: 'task' } },
      });
    });

    test('allows custom queries', async () => {
      const { args } = await testFetch({
        query: {
          term: { 'task.taskType': 'bar' },
        },
      });

      expect(args).toMatchObject({
        query: {
          bool: {
            must: [{ term: { type: 'task' } }, { term: { 'task.taskType': 'bar' } }],
          },
        },
      });
    });

    test('pushes error from call cluster to errors$', async () => {
      const firstErrorPromise = store.errors$.pipe(first()).toPromise();
      childEsClient.search.mockRejectedValue(new Error('Failure'));
      await expect(store.fetch()).rejects.toThrowErrorMatchingInlineSnapshot(`"Failure"`);
      expect(await firstErrorPromise).toMatchInlineSnapshot(`[Error: Failure]`);
    });

    test('excludes state and params from source when limitResponse is true', async () => {
      const { args } = await testFetch({}, [], true);
      expect(args).toMatchObject({
        index: 'tasky',
        sort: [{ 'task.runAt': 'asc' }],
        query: { term: { type: 'task' } },
        _source_excludes: ['task.state', 'task.params'],
      });
    });
  });

  describe('msearch', () => {
    let store: TaskStore;
    let esClient: ReturnType<typeof elasticsearchServiceMock.createClusterClient>['asInternalUser'];
    let childEsClient: ReturnType<
      typeof elasticsearchServiceMock.createClusterClient
    >['asInternalUser'];

    const mockTask = {
      taskType: 'taskWithApiKey',
      params: '{}',
      state: '{}',
      enabled: true,
      schedule: {
        interval: '30s',
      },
      traceparent: '',
      attempts: 1,
      scheduledAt: '2019-02-12T21:01:22.479Z',
      startedAt: '2019-02-12T21:01:22.479Z',
      retryAt: '2019-02-12T21:01:22.479Z',
      runAt: '2019-02-12T21:01:22.479Z',
      status: 'running',
      partition: 237,
      userScope: {
        apiKeyId: 'EJYCtpUBGuyFd3FroZmZ',
        spaceId: 'default',
        apiKeyCreatedByUser: false,
      },
      ownerId: 'kibana:5b2de169-2785-441b-ae8c-186a1936b17d',
      id: 'task1',
      version: '123',
    };

    beforeEach(() => {
      const mockSerializer = savedObjectsServiceMock.createSerializer();
      mockSerializer.isRawSavedObject = jest.fn().mockReturnValue(true);
      mockSerializer.rawToSavedObject = jest.fn().mockImplementation((doc) => ({
        id: 'task1',
        version: '123',
        type: 'task',
        references: [],
        attributes: {
          ...doc._source.task,
        },
      }));

      esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      childEsClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      esClient.child.mockReturnValue(childEsClient as unknown as Client);
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer: mockSerializer,
        esClient,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        canEncryptSavedObjects: true,
        getIsSecurityEnabled: () => true,
      });

      esoClient.createPointInTimeFinderDecryptedAsInternalUser = jest.fn().mockResolvedValue({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield {
            saved_objects: [
              {
                id: 'task1',
                attributes: {
                  ...mockTask,
                  apiKey: 'decryptedApiKey',
                },
              },
            ],
          };
        },
      });

      store.registerEncryptedSavedObjectsClient(esoClient);
    });

    async function testMsearch(
      optsArray: SearchOpts[],
      hitsArray: Array<estypes.SearchHitsMetadata<unknown>> = []
    ) {
      childEsClient.msearch.mockResponse({
        took: 0,
        responses: hitsArray.map((hits) => ({
          hits,
          took: 0,
          _shards: {
            failed: 0,
            successful: 1,
            total: 1,
          },
          timed_out: false,
          status: 200,
        })),
      });

      const result = await store.msearch(optsArray);

      expect(childEsClient.msearch).toHaveBeenCalledTimes(1);

      return {
        result,
        args: childEsClient.msearch.mock.calls[0][0],
      };
    }

    test('empty call filters by type, sorts by runAt and id', async () => {
      const { args } = await testMsearch([{}], []);
      expect(args).toMatchObject({
        index: 'tasky',
        searches: [
          {},
          {
            sort: [{ 'task.runAt': 'asc' }],
            query: { term: { type: 'task' } },
          },
        ],
      });
    });

    test('allows multiple custom queries', async () => {
      const { args } = await testMsearch(
        [
          {
            query: {
              term: { 'task.taskType': 'foo' },
            },
          },
          {
            query: {
              term: { 'task.taskType': 'bar' },
            },
          },
        ],
        []
      );

      expect(args).toMatchObject({
        searches: [
          {},
          {
            query: {
              bool: {
                must: [{ term: { type: 'task' } }, { term: { 'task.taskType': 'foo' } }],
              },
            },
          },
          {},
          {
            query: {
              bool: {
                must: [{ term: { type: 'task' } }, { term: { 'task.taskType': 'bar' } }],
              },
            },
          },
        ],
      });
    });

    test('should return tasks with decrypted API keys', async () => {
      const { result } = await testMsearch(
        [{}],
        [
          {
            hits: [
              {
                _index: '.kibana_task_manager_8.16.0_001',
                _source: {
                  task: { ...mockTask, apiKey: 'encryptedKey' },
                },
              },
            ],
          },
        ]
      );

      expect(result.docs[0]).toEqual({
        ...mockTask,
        retryAt: new Date(mockTask.retryAt),
        runAt: new Date(mockTask.runAt),
        scheduledAt: new Date(mockTask.scheduledAt),
        startedAt: new Date(mockTask.startedAt),
        state: {},
        params: {},
        apiKey: 'decryptedApiKey',
      });
    });

    test('pushes error from call cluster to errors$', async () => {
      const firstErrorPromise = store.errors$.pipe(first()).toPromise();
      childEsClient.msearch.mockResponse({
        took: 0,
        responses: [
          {
            took: 0,
            _shards: {
              failed: 0,
              successful: 1,
              total: 1,
            },
            timed_out: false,
            status: 429,
          },
        ],
      } as estypes.MsearchResponse);

      try {
        await store.msearch([{}]);
        throw new Error('should have thrown');
      } catch (err) {
        expect(err instanceof MsearchError).toBe(true);
        expect(err.statusCode).toEqual(429);
      }
      expect(await firstErrorPromise).toMatchInlineSnapshot(
        `[Error: Unexpected status code from taskStore::msearch: 429]`
      );
    });
  });

  describe('aggregate', () => {
    let store: TaskStore;
    let esClient: ReturnType<typeof elasticsearchServiceMock.createClusterClient>['asInternalUser'];

    beforeAll(() => {
      esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });
    });

    async function testAggregate(
      opts: AggregationOpts,
      hits: Array<estypes.SearchHit<unknown>> = []
    ) {
      esClient.search.mockResponse({
        hits: { hits, total: hits.length },
        aggregations: {},
      } as estypes.SearchResponse);

      const result = await store.aggregate(opts);

      expect(esClient.search).toHaveBeenCalledTimes(1);

      return {
        result,
        args: esClient.search.mock.calls[0][0],
      };
    }

    test('empty call filters by type, sets size to 0, passes aggregation to esClient', async () => {
      const { args } = await testAggregate({
        aggs: { testAgg: { terms: { field: 'task.taskType' } } },
      });
      expect(args).toMatchObject({
        index: 'tasky',
        size: 0,
        query: {
          bool: {
            filter: {
              bool: {
                must: [{ term: { type: 'task' } }, { term: { 'task.enabled': true } }],
                must_not: [{ term: { 'task.status': 'unrecognized' } }],
              },
            },
          },
        },
        aggs: { testAgg: { terms: { field: 'task.taskType' } } },
      });
    });

    test('allows custom queries', async () => {
      const { args } = await testAggregate({
        aggs: { testAgg: { terms: { field: 'task.taskType' } } },
        query: {
          term: { 'task.taskType': 'bar' },
        },
      });

      expect(args).toMatchObject({
        size: 0,
        query: {
          bool: {
            must: [
              {
                bool: {
                  filter: {
                    bool: {
                      must: [{ term: { type: 'task' } }, { term: { 'task.enabled': true } }],
                      must_not: [{ term: { 'task.status': 'unrecognized' } }],
                    },
                  },
                },
              },
              { term: { 'task.taskType': 'bar' } },
            ],
          },
        },
        aggs: { testAgg: { terms: { field: 'task.taskType' } } },
      });
    });

    test('allows runtime mappings', async () => {
      const { args } = await testAggregate({
        aggs: { testAgg: { terms: { field: 'task.taskType' } } },
        runtime_mappings: { testMapping: { type: 'long', script: { source: `` } } },
      });

      expect(args).toMatchObject({
        size: 0,
        query: {
          bool: {
            filter: {
              bool: {
                must: [{ term: { type: 'task' } }, { term: { 'task.enabled': true } }],
                must_not: [{ term: { 'task.status': 'unrecognized' } }],
              },
            },
          },
        },
        aggs: { testAgg: { terms: { field: 'task.taskType' } } },
        runtime_mappings: { testMapping: { type: 'long', script: { source: `` } } },
      });
    });

    test('throws error when esClient.search throws error', async () => {
      esClient.search.mockRejectedValue(new Error('Failure'));
      await expect(store.aggregate({ aggs: {} })).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failure"`
      );
    });
  });

  describe('update', () => {
    let store: TaskStore;
    let esClient: ReturnType<typeof elasticsearchServiceMock.createClusterClient>['asInternalUser'];

    beforeAll(() => {
      esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });
    });

    test('refreshes the index, handles versioning', async () => {
      const task = {
        runAt: mockedDate,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        id: 'task:324242',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        attempts: 3,
        status: 'idle' as TaskStatus,
        version: '123',
        ownerId: null,
        traceparent: 'myTraceparent',
        partition: 99,
      };

      savedObjectsClient.update.mockImplementation(
        async (type: string, id: string, attributes: SavedObjectAttributes) => {
          return {
            id,
            type,
            attributes,
            references: [],
            version: '123',
          };
        }
      );

      const result = await store.update(task, { validate: true });

      expect(mockGetValidatedTaskInstanceForUpdating).toHaveBeenCalledTimes(1);
      expect(mockGetValidatedTaskInstanceFromReading).toHaveBeenCalledTimes(1);
      expect(mockGetValidatedTaskInstanceForUpdating).toHaveBeenCalledWith(task, {
        validate: true,
      });
      expect(mockGetValidatedTaskInstanceFromReading).toHaveBeenCalledWith(task, {
        validate: true,
      });
      expect(savedObjectsClient.update).toHaveBeenCalledWith(
        'task',
        task.id,
        {
          attempts: task.attempts,
          schedule: undefined,
          params: JSON.stringify(task.params),
          retryAt: null,
          runAt: task.runAt.toISOString(),
          scheduledAt: mockedDate.toISOString(),
          scope: undefined,
          startedAt: null,
          state: JSON.stringify(task.state),
          status: task.status,
          taskType: task.taskType,
          user: undefined,
          ownerId: null,
          traceparent: 'myTraceparent',
          partition: 99,
        },
        { version: '123', refresh: false }
      );

      expect(result).toEqual({
        ...task,
        schedule: undefined,
        retryAt: null,
        scope: undefined,
        startedAt: null,
        user: undefined,
        version: '123',
      });
    });

    test(`doesn't go through validation process to inject stateVersion when validate:false`, async () => {
      const task = {
        runAt: mockedDate,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        id: 'task:324242',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        attempts: 3,
        status: 'idle' as TaskStatus,
        version: '123',
        ownerId: null,
        traceparent: 'myTraceparent',
      };

      savedObjectsClient.update.mockImplementation(
        async (type: string, id: string, attributes: SavedObjectAttributes) => {
          return {
            id,
            type,
            attributes,
            references: [],
            version: '123',
          };
        }
      );

      await store.update(task, { validate: false });

      expect(mockGetValidatedTaskInstanceForUpdating).toHaveBeenCalledWith(task, {
        validate: false,
      });
    });

    test('pushes error from saved objects client to errors$', async () => {
      const task = {
        runAt: mockedDate,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        id: 'task:324242',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        attempts: 3,
        status: 'idle' as TaskStatus,
        version: '123',
        ownerId: null,
        traceparent: '',
      };

      const firstErrorPromise = store.errors$.pipe(first()).toPromise();
      savedObjectsClient.update.mockRejectedValue(new Error('Failure'));
      await expect(
        store.update(task, { validate: true })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Failure"`);
      expect(await firstErrorPromise).toMatchInlineSnapshot(`[Error: Failure]`);
    });

    test('throws an error when an invalid interval is provided', async () => {
      mockGetValidatedTaskInstanceFromReading.mockRestore();
      mockGetValidatedTaskInstanceForUpdating.mockRestore();

      const task = {
        runAt: mockedDate,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        id: 'task:324242',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        attempts: 3,
        status: 'idle' as TaskStatus,
        version: '123',
        ownerId: null,
        traceparent: 'myTraceparent',
        partition: 99,
        schedule: { interval: 'invalid-interval' },
      };

      savedObjectsClient.update.mockImplementation(
        async (type: string, id: string, attributes: SavedObjectAttributes) => {
          return {
            id,
            type,
            attributes,
            references: [],
            version: '123',
          };
        }
      );

      await expect(store.update(task, { validate: true })).rejects.toThrowError(
        `[TaskValidator] Invalid interval "invalid-interval". Interval must be of the form "{number}{cadence}" where number is an integer. Example: 5m.`
      );
    });
  });

  describe('bulkUpdate', () => {
    let store: TaskStore;
    const logger = mockLogger();

    beforeAll(() => {
      store = new TaskStore({
        logger,
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });
    });

    test(`doesn't validate whenever validate:false is passed-in`, async () => {
      const task = {
        runAt: mockedDate,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        id: 'task:324242',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        attempts: 3,
        status: 'idle' as TaskStatus,
        version: '123',
        ownerId: null,
        traceparent: '',
      };

      savedObjectsClient.bulkUpdate.mockResolvedValue({
        saved_objects: [
          {
            id: '324242',
            type: 'task',
            attributes: {
              ...task,
              state: '{"foo":"bar"}',
              params: '{"hello":"world"}',
            },
            references: [],
            version: '123',
          },
        ],
      });

      await store.bulkUpdate([task], { validate: false });

      expect(mockGetValidatedTaskInstanceForUpdating).toHaveBeenCalledWith(task, {
        validate: false,
      });

      expect(savedObjectsClient.bulkUpdate).toHaveBeenCalledWith(
        [
          {
            id: task.id,
            type: 'task',
            version: task.version,
            attributes: taskInstanceToAttributes(task, task.id),
          },
        ],
        { refresh: false }
      );
    });

    test(`validates whenever validate:true is passed-in`, async () => {
      const task = {
        runAt: mockedDate,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        id: 'task:324242',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        attempts: 3,
        status: 'idle' as TaskStatus,
        version: '123',
        ownerId: null,
        traceparent: '',
      };

      savedObjectsClient.bulkUpdate.mockResolvedValue({
        saved_objects: [
          {
            id: '324242',
            type: 'task',
            attributes: {
              ...task,
              state: '{"foo":"bar"}',
              params: '{"hello":"world"}',
            },
            references: [],
            version: '123',
          },
        ],
      });

      await store.bulkUpdate([task], { validate: true });

      expect(mockGetValidatedTaskInstanceForUpdating).toHaveBeenCalledWith(task, {
        validate: true,
      });

      expect(savedObjectsClient.bulkUpdate).toHaveBeenCalledWith(
        [
          {
            id: task.id,
            type: 'task',
            version: task.version,
            attributes: taskInstanceToAttributes(task, task.id),
          },
        ],
        { refresh: false }
      );
    });

    test('pushes error from saved objects client to errors$', async () => {
      const task = {
        runAt: mockedDate,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        id: 'task:324242',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        attempts: 3,
        status: 'idle' as TaskStatus,
        version: '123',
        ownerId: null,
        traceparent: '',
      };

      const firstErrorPromise = store.errors$.pipe(first()).toPromise();
      savedObjectsClient.bulkUpdate.mockRejectedValue(new Error('Failure'));
      await expect(
        store.bulkUpdate([task], { validate: true })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Failure"`);
      expect(await firstErrorPromise).toMatchInlineSnapshot(`[Error: Failure]`);
    });

    test('skips the update with invalid interval', async () => {
      mockGetValidatedTaskInstanceFromReading.mockRestore();
      mockGetValidatedTaskInstanceForUpdating.mockRestore();

      const task1 = {
        runAt: mockedDate,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        id: 'task:1',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'yawn',
        attempts: 3,
        status: 'idle' as TaskStatus,
        version: '123',
        ownerId: null,
        traceparent: '',
      };

      const task2 = {
        runAt: mockedDate,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        id: 'task:2',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        attempts: 3,
        status: 'idle' as TaskStatus,
        version: '123',
        ownerId: null,
        traceparent: '',
        schedule: { interval: 'invalid' }, // Invalid interval
      };

      savedObjectsClient.bulkUpdate.mockResolvedValue({
        saved_objects: [
          {
            id: 'task:1',
            type: 'task',
            attributes: {
              ...task1,
              state: '{"foo":"bar"}',
              params: '{"hello":"world"}',
            },
            references: [],
            version: '123',
          },
        ],
      });

      await store.bulkUpdate([task1, task2], { validate: true });

      expect(logger.error).toHaveBeenCalledWith(
        '[TaskStore] An error occured. Task task:2 will not be updated. Error: [TaskValidator] Invalid interval "invalid". Interval must be of the form "{number}{cadence}" where number is an integer. Example: 5m.'
      );

      expect(savedObjectsClient.bulkUpdate).toHaveBeenCalledWith(
        [
          {
            id: task1.id,
            type: 'task',
            version: task1.version,
            attributes: taskInstanceToAttributes(task1, task1.id),
          },
        ],
        { refresh: false }
      );
    });
  });

  describe('bulkPartialUpdate', () => {
    let store: TaskStore;
    let esClient: ElasticsearchClientMock;
    const logger = mockLogger();

    beforeAll(() => {
      esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      store = new TaskStore({
        logger,
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });
    });

    test(`should return immediately if no docs to update`, async () => {
      await store.bulkPartialUpdate([]);

      expect(mockGetValidatedTaskInstanceForUpdating).not.toHaveBeenCalled();
      expect(esClient.bulk).not.toHaveBeenCalled();
    });

    test(`should perform partial update using esClient`, async () => {
      const task = {
        id: '324242',
        version: 'WzQsMV0=',
        runAt: mockedDate,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        attempts: 3,
        status: 'idle' as TaskStatus,
        ownerId: 'testtest',
        traceparent: '',
      };

      esClient.bulk.mockResolvedValue({
        errors: false,
        took: 0,
        items: [
          {
            update: {
              _index: '.kibana_task_manager_8.16.0_001',
              _id: 'task:324242',
              _version: 2,
              result: 'updated',
              _shards: { total: 1, successful: 1, failed: 0 },
              _seq_no: 84,
              _primary_term: 1,
              status: 200,
            },
          },
        ],
      });

      const result = await store.bulkPartialUpdate([task]);

      expect(mockGetValidatedTaskInstanceForUpdating).not.toHaveBeenCalled();

      expect(esClient.bulk).toHaveBeenCalledWith({
        body: [
          { update: { _id: 'task:324242', if_primary_term: 1, if_seq_no: 4 } },
          {
            doc: {
              task: {
                attempts: 3,
                ownerId: 'testtest',
                params: '{"hello":"world"}',
                retryAt: null,
                runAt: '2019-02-12T21:01:22.479Z',
                scheduledAt: '2019-02-12T21:01:22.479Z',
                startedAt: null,
                state: '{"foo":"bar"}',
                status: 'idle',
                taskType: 'report',
                traceparent: '',
              },
            },
          },
        ],
        index: 'tasky',
        refresh: false,
      });

      expect(result).toEqual([
        // New version returned after update
        asOk({ ...task, version: 'Wzg0LDFd' }),
      ]);
    });

    test(`should perform partial update with minimal fields`, async () => {
      const task = {
        id: '324242',
        version: 'WzQsMV0=',
        attempts: 3,
      };

      esClient.bulk.mockResolvedValue({
        errors: false,
        took: 0,
        items: [
          {
            update: {
              _index: '.kibana_task_manager_8.16.0_001',
              _id: 'task:324242',
              _version: 2,
              result: 'updated',
              _shards: { total: 1, successful: 1, failed: 0 },
              _seq_no: 84,
              _primary_term: 1,
              status: 200,
            },
          },
        ],
      });

      const result = await store.bulkPartialUpdate([task]);

      expect(mockGetValidatedTaskInstanceForUpdating).not.toHaveBeenCalled();

      expect(esClient.bulk).toHaveBeenCalledWith({
        body: [
          { update: { _id: 'task:324242', if_primary_term: 1, if_seq_no: 4 } },
          { doc: { task: { attempts: 3 } } },
        ],
        index: 'tasky',
        refresh: false,
      });

      // New version returned after update
      expect(result).toEqual([asOk({ ...task, version: 'Wzg0LDFd' })]);
    });

    test(`should perform partial update with no version`, async () => {
      const task = {
        id: '324242',
        attempts: 3,
      };

      esClient.bulk.mockResolvedValue({
        errors: false,
        took: 0,
        items: [
          {
            update: {
              _index: '.kibana_task_manager_8.16.0_001',
              _id: 'task:324242',
              _version: 2,
              result: 'updated',
              _shards: { total: 1, successful: 1, failed: 0 },
              _seq_no: 84,
              _primary_term: 1,
              status: 200,
            },
          },
        ],
      });

      const result = await store.bulkPartialUpdate([task]);

      expect(mockGetValidatedTaskInstanceForUpdating).not.toHaveBeenCalled();

      expect(esClient.bulk).toHaveBeenCalledWith({
        body: [{ update: { _id: 'task:324242' } }, { doc: { task: { attempts: 3 } } }],
        index: 'tasky',
        refresh: false,
      });

      // New version returned after update
      expect(result).toEqual([asOk({ ...task, version: 'Wzg0LDFd' })]);
    });

    test(`should gracefully handle errors within the response`, async () => {
      const task1 = {
        id: '324242',
        version: 'WzQsMV0=',
        attempts: 3,
      };

      const task2 = {
        id: '45343254',
        version: 'WzQsMV0=',
        status: 'running' as TaskStatus,
      };

      const task3 = {
        id: '7845',
        version: 'WzQsMV0=',
        runAt: mockedDate,
      };

      esClient.bulk.mockResolvedValue({
        errors: false,
        took: 0,
        items: [
          {
            update: {
              _index: '.kibana_task_manager_8.16.0_001',
              _id: 'task:324242',
              _version: 2,
              result: 'updated',
              _shards: { total: 1, successful: 1, failed: 0 },
              _seq_no: 84,
              _primary_term: 1,
              status: 200,
            },
          },
          {
            update: {
              _index: '.kibana_task_manager_8.16.0_001',
              _id: 'task:45343254',
              _version: 2,
              error: {
                type: 'document_missing_exception',
                reason: '[5]: document missing',
                index_uuid: 'aAsFqTI0Tc2W0LCWgPNrOA',
                shard: '0',
                index: '.kibana_task_manager_8.16.0_001',
              },
              status: 404,
            },
          },
          {
            update: {
              _index: '.kibana_task_manager_8.16.0_001',
              _id: 'task:7845',
              _version: 2,
              status: 409,
              error: { type: 'anything', reason: 'some-reason', index: 'some-index' },
            },
          },
        ],
      });

      const result = await store.bulkPartialUpdate([task1, task2, task3]);

      expect(mockGetValidatedTaskInstanceForUpdating).not.toHaveBeenCalled();

      expect(esClient.bulk).toHaveBeenCalledWith({
        body: [
          { update: { _id: 'task:324242', if_primary_term: 1, if_seq_no: 4 } },
          { doc: { task: { attempts: 3 } } },
          { update: { _id: 'task:45343254', if_primary_term: 1, if_seq_no: 4 } },
          { doc: { task: { status: 'running' } } },
          { update: { _id: 'task:7845', if_primary_term: 1, if_seq_no: 4 } },
          { doc: { task: { runAt: mockedDate.toISOString() } } },
        ],
        index: 'tasky',
        refresh: false,
      });

      expect(result).toEqual([
        // New version returned after update
        asOk({ ...task1, version: 'Wzg0LDFd' }),
        asErr({
          type: 'task',
          id: '45343254',
          status: 404,
          error: {
            type: 'document_missing_exception',
            reason: '[5]: document missing',
            index_uuid: 'aAsFqTI0Tc2W0LCWgPNrOA',
            shard: '0',
            index: '.kibana_task_manager_8.16.0_001',
          },
        }),
        asErr({
          type: 'task',
          id: '7845',
          status: 409,
          error: { type: 'anything', reason: 'some-reason', index: 'some-index' },
        }),
      ]);
    });

    test(`should gracefully handle malformed errors within the response`, async () => {
      const task1 = {
        id: '324242',
        version: 'WzQsMV0=',
        attempts: 3,
      };

      const task2 = {
        id: '45343254',
        version: 'WzQsMV0=',
        status: 'running' as TaskStatus,
      };

      esClient.bulk.mockResolvedValue({
        errors: false,
        took: 0,
        items: [
          {
            update: {
              _index: '.kibana_task_manager_8.16.0_001',
              _id: 'task:324242',
              _version: 2,
              result: 'updated',
              _shards: { total: 1, successful: 1, failed: 0 },
              _seq_no: 84,
              _primary_term: 1,
              status: 200,
            },
          },
          {
            update: {
              _index: '.kibana_task_manager_8.16.0_001',
              _version: 2,
              error: {
                type: 'document_missing_exception',
                reason: '[5]: document missing',
                index_uuid: 'aAsFqTI0Tc2W0LCWgPNrOA',
                shard: '0',
                index: '.kibana_task_manager_8.16.0_001',
              },
              status: 404,
            },
          },
        ],
      });

      const result = await store.bulkPartialUpdate([task1, task2]);

      expect(mockGetValidatedTaskInstanceForUpdating).not.toHaveBeenCalled();

      expect(esClient.bulk).toHaveBeenCalledWith({
        body: [
          { update: { _id: 'task:324242', if_primary_term: 1, if_seq_no: 4 } },
          { doc: { task: { attempts: 3 } } },
          { update: { _id: 'task:45343254', if_primary_term: 1, if_seq_no: 4 } },
          { doc: { task: { status: 'running' } } },
        ],
        index: 'tasky',
        refresh: false,
      });

      expect(result).toEqual([
        // New version returned after update
        asOk({ ...task1, version: 'Wzg0LDFd' }),
        asErr({
          type: 'task',
          id: 'unknown',
          error: { type: 'malformed response' },
        }),
      ]);
    });

    test('pushes error from saved objects client to errors$', async () => {
      const task = {
        id: '324242',
        version: 'WzQsMV0=',
        attempts: 3,
      };

      const firstErrorPromise = store.errors$.pipe(first()).toPromise();
      esClient.bulk.mockRejectedValue(new Error('Failure'));
      await expect(store.bulkPartialUpdate([task])).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failure"`
      );
      expect(await firstErrorPromise).toMatchInlineSnapshot(`[Error: Failure]`);
    });

    test('pushes errors returned by the saved objects client to errors$', async () => {
      const task = {
        id: '324242',
        version: 'WzQsMV0=',
        attempts: 3,
      };

      const firstErrorPromise = store.errors$.pipe(first()).toPromise();

      esClient.bulk.mockResolvedValue({
        errors: true,
        items: [
          {
            update: {
              _id: '1',
              _index: 'test-index',
              status: 403,
              error: { reason: 'Error reason', type: 'cluster_block_exception' },
            },
          },
        ],
        took: 10,
      });

      await store.bulkPartialUpdate([task]);

      expect(await firstErrorPromise).toMatchInlineSnapshot(`[Error: Error reason]`);
    });

    test('pushes errors for the malformed responses to errors$', async () => {
      const task = {
        id: '324242',
        version: 'WzQsMV0=',
        attempts: 3,
      };

      const firstErrorPromise = store.errors$.pipe(first()).toPromise();

      esClient.bulk.mockResolvedValue({
        errors: false,
        items: [
          {
            update: {
              _index: 'test-index',
              status: 200,
            },
          },
        ],
        took: 10,
      });

      await store.bulkPartialUpdate([task]);

      expect(await firstErrorPromise).toMatchInlineSnapshot(`[Error: malformed response]`);
    });

    test('skips the update with invalid interval', async () => {
      const task1 = {
        id: 'task1',
        version: 'WzQsMV0=',
        runAt: mockedDate,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        attempts: 3,
        status: 'idle' as TaskStatus,
        ownerId: 'testtest',
        traceparent: '',
      };

      const task2 = {
        id: 'task2',
        version: 'WzQsMV0=',
        runAt: mockedDate,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        attempts: 3,
        status: 'idle' as TaskStatus,
        ownerId: 'testtest',
        traceparent: '',
        schedule: { interval: 'invalid-interval' },
      };

      esClient.bulk.mockResolvedValue({
        errors: false,
        took: 0,
        items: [
          {
            update: {
              _index: '.kibana_task_manager_8.16.0_001',
              _id: 'task:task1',
              _version: 2,
              result: 'updated',
              _shards: { total: 1, successful: 1, failed: 0 },
              _seq_no: 84,
              _primary_term: 1,
              status: 200,
            },
          },
        ],
      });

      const result = await store.bulkPartialUpdate([task1, task2]);

      expect(mockGetValidatedTaskInstanceForUpdating).not.toHaveBeenCalled();

      expect(esClient.bulk).toHaveBeenCalledWith({
        body: [
          { update: { _id: 'task:task1', if_primary_term: 1, if_seq_no: 4 } },
          {
            doc: {
              task: {
                attempts: 3,
                ownerId: 'testtest',
                params: '{"hello":"world"}',
                retryAt: null,
                runAt: '2019-02-12T21:01:22.479Z',
                scheduledAt: '2019-02-12T21:01:22.479Z',
                startedAt: null,
                state: '{"foo":"bar"}',
                status: 'idle',
                taskType: 'report',
                traceparent: '',
              },
            },
          },
        ],
        index: 'tasky',
        refresh: false,
      });

      expect(result).toEqual([
        // New version returned after update
        asOk({ ...task1, version: 'Wzg0LDFd' }),
      ]);

      expect(logger.error).toHaveBeenCalledWith(
        '[TaskStore] Invalid interval "invalid-interval". Task task2 will not be updated.'
      );
    });
  });

  describe('remove', () => {
    let store: TaskStore;
    const mockApiKey = Buffer.from('apiKeyId:apiKey').toString('base64');

    const mockTask = {
      id: 'task1',
      type: 'test',
      attributes: {
        attempts: 0,
        params: '{"hello":"world"}',
        retryAt: null,
        runAt: '2019-02-12T21:01:22.479Z',
        scheduledAt: '2019-02-12T21:01:22.479Z',
        startedAt: null,
        state: '{"foo":"bar"}',
        stateVersion: 1,
        status: 'idle',
        taskType: 'report',
        traceparent: 'apmTraceparent',
        partition: 225,
        apiKey: mockApiKey,
        userScope: {
          apiKeyId: 'apiKeyId',
          apiKeyCreatedBy: 'testUser',
          spaceId: 'testSpace',
        },
      },
      references: [],
      version: '123',
    };

    beforeEach(() => {
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        canEncryptSavedObjects: true,
        getIsSecurityEnabled: () => true,
      });

      esoClient.createPointInTimeFinderDecryptedAsInternalUser = jest.fn().mockResolvedValue({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [mockTask] };
        },
      });

      store.registerEncryptedSavedObjectsClient(esoClient);
    });

    test('removes the task with the specified id', async () => {
      savedObjectsClient.get.mockResolvedValueOnce(mockTask);
      const id = randomId();
      const result = await store.remove(id);
      expect(result).toBeUndefined();
      expect(savedObjectsClient.delete).toHaveBeenCalledWith('task', id, { refresh: false });
    });

    test('invalidates API key of task with api key', async () => {
      savedObjectsClient.get.mockResolvedValueOnce(mockTask);
      const id = 'task1';
      const result = await store.remove(id);
      expect(result).toBeUndefined();
      expect(savedObjectsClient.delete).toHaveBeenCalledWith('task', id, { refresh: false });
      expect(coreStart.security.authc.apiKeys.invalidateAsInternalUser).toHaveBeenCalledWith({
        ids: ['apiKeyId'],
      });
    });

    test('pushes error from saved objects client to errors$', async () => {
      savedObjectsClient.get.mockResolvedValueOnce(mockTask);
      const firstErrorPromise = store.errors$.pipe(first()).toPromise();
      savedObjectsClient.delete.mockRejectedValue(new Error('Failure'));
      await expect(store.remove(randomId())).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failure"`
      );
      expect(await firstErrorPromise).toMatchInlineSnapshot(`[Error: Failure]`);
    });
  });

  describe('bulkRemove', () => {
    let store: TaskStore;
    const mockApiKey1 = Buffer.from('apiKeyId1:apiKey').toString('base64');
    const mockApiKey2 = Buffer.from('apiKeyId2:apiKey').toString('base64');

    const mockTask1 = {
      id: 'task1',
      type: 'test',
      attributes: {
        attempts: 0,
        params: '{"hello":"world"}',
        retryAt: null,
        runAt: '2019-02-12T21:01:22.479Z',
        scheduledAt: '2019-02-12T21:01:22.479Z',
        startedAt: null,
        state: '{"foo":"bar"}',
        stateVersion: 1,
        status: 'idle',
        taskType: 'report',
        traceparent: 'apmTraceparent',
        partition: 225,
        apiKey: mockApiKey1,
        userScope: {
          apiKeyId: 'apiKeyId1',
          apiKeyCreatedBy: 'testUser',
          spaceId: 'testSpace',
        },
      },
      references: [],
      version: '123',
    };

    const mockTask2 = {
      id: 'task2',
      type: 'test',
      attributes: {
        attempts: 0,
        params: '{"hello":"world"}',
        retryAt: null,
        runAt: '2019-02-12T21:01:22.479Z',
        scheduledAt: '2019-02-12T21:01:22.479Z',
        startedAt: null,
        state: '{"foo":"bar"}',
        stateVersion: 1,
        status: 'idle',
        taskType: 'report',
        traceparent: 'apmTraceparent',
        partition: 225,
        apiKey: mockApiKey2,
        userScope: {
          apiKeyId: 'apiKeyId2',
          apiKeyCreatedBy: 'testUser',
          spaceId: 'testSpace',
        },
      },
      references: [],
      version: '123',
    };

    const tasksIdsToDelete = [randomId(), randomId()];

    beforeEach(() => {
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        canEncryptSavedObjects: true,
        getIsSecurityEnabled: () => true,
      });

      esoClient.createPointInTimeFinderDecryptedAsInternalUser = jest.fn().mockResolvedValue({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [mockTask1, mockTask2] };
        },
      });

      store.registerEncryptedSavedObjectsClient(esoClient);
    });

    test('removes the tasks with the specified ids', async () => {
      savedObjectsClient.bulkGet.mockResolvedValueOnce({
        saved_objects: [mockTask1, mockTask2],
      });
      const result = await store.bulkRemove(tasksIdsToDelete);
      expect(result).toBeUndefined();
      expect(savedObjectsClient.bulkDelete).toHaveBeenCalledWith(
        [
          { type: 'task', id: tasksIdsToDelete[0] },
          { type: 'task', id: tasksIdsToDelete[1] },
        ],
        { refresh: false }
      );
    });

    test('bulk invalidates API key of tasks with API keys', async () => {
      savedObjectsClient.bulkGet.mockResolvedValueOnce({
        saved_objects: [mockTask1, mockTask2],
      });
      const result = await store.bulkRemove(['task1', 'task2']);
      expect(result).toBeUndefined();
      expect(coreStart.security.authc.apiKeys.invalidateAsInternalUser).toHaveBeenCalledWith({
        ids: ['apiKeyId1', 'apiKeyId2'],
      });
    });

    test('pushes error from saved objects client to errors$', async () => {
      savedObjectsClient.bulkGet.mockResolvedValueOnce({
        saved_objects: [mockTask1, mockTask2],
      });
      const firstErrorPromise = store.errors$.pipe(first()).toPromise();
      savedObjectsClient.bulkDelete.mockRejectedValue(new Error('Failure'));
      await expect(store.bulkRemove(tasksIdsToDelete)).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failure"`
      );
      expect(await firstErrorPromise).toMatchInlineSnapshot(`[Error: Failure]`);
    });
  });

  describe('get', () => {
    let store: TaskStore;

    beforeAll(() => {
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });
    });

    test('gets the task with the specified id', async () => {
      const task = {
        runAt: mockedDate,
        scheduledAt: mockedDate,
        startedAt: null,
        retryAt: null,
        id: randomId(),
        params: { hello: 'world' },
        state: { foo: 'bar' },
        stateVersion: 1,
        taskType: 'report',
        attempts: 3,
        status: 'idle' as TaskStatus,
        version: '123',
        ownerId: null,
      };

      savedObjectsClient.get.mockImplementation(async (type: string, objectId: string) => ({
        id: objectId,
        type,
        attributes: {
          ..._.omit(task, 'id'),
          ..._.mapValues(_.pick(task, ['params', 'state']), (value) => JSON.stringify(value)),
        },
        references: [],
        version: '123',
      }));

      const result = await store.get(task.id);

      expect(result).toEqual(task);

      expect(savedObjectsClient.get).toHaveBeenCalledWith('task', task.id);
    });

    test('pushes error from saved objects client to errors$', async () => {
      const firstErrorPromise = store.errors$.pipe(first()).toPromise();
      savedObjectsClient.get.mockRejectedValue(new Error('Failure'));
      await expect(store.get(randomId())).rejects.toThrowErrorMatchingInlineSnapshot(`"Failure"`);
      expect(await firstErrorPromise).toMatchInlineSnapshot(`[Error: Failure]`);
    });
  });

  describe('bulkGet', () => {
    let store: TaskStore;

    beforeAll(() => {
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });
    });

    test('gets a task specified by id', async () => {
      savedObjectsClient.bulkGet.mockResolvedValue({ saved_objects: [] });
      await store.bulkGet(['1', '2']);
      expect(savedObjectsClient.bulkGet).toHaveBeenCalledWith([
        { type: 'task', id: '1' },
        { type: 'task', id: '2' },
      ]);
    });

    test('returns error when task not found', async () => {
      savedObjectsClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            type: 'task',
            id: '1',
            attributes: {},
            references: [],
            error: {
              error: 'Oh no',
              message: 'Oh no',
              statusCode: 404,
            },
          },
        ],
      });
      const result = await store.bulkGet(['1']);
      expect(result).toEqual([
        asErr({
          type: 'task',
          id: '1',
          error: {
            error: 'Oh no',
            message: 'Oh no',
            statusCode: 404,
          },
        }),
      ]);
    });

    test('pushes error from saved objects client to errors$', async () => {
      const firstErrorPromise = store.errors$.pipe(first()).toPromise();
      savedObjectsClient.bulkGet.mockRejectedValue(new Error('Failure'));
      await expect(store.bulkGet([randomId()])).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failure"`
      );
      expect(await firstErrorPromise).toMatchInlineSnapshot(`[Error: Failure]`);
    });
  });

  describe('getLifecycle', () => {
    test('returns the task status if the task exists ', async () => {
      expect.assertions(7);
      return Promise.all(
        Object.values(TaskStatus).map(async (status) => {
          const task = {
            runAt: mockedDate,
            scheduledAt: mockedDate,
            startedAt: null,
            retryAt: null,
            id: randomId(),
            params: { hello: 'world' },
            state: { foo: 'bar' },
            stateVersion: 1,
            taskType: 'report',
            attempts: 3,
            status: status as TaskStatus,
            version: '123',
            ownerId: null,
            traceparent: 'myTraceparent',
          };

          savedObjectsClient.get.mockImplementation(async (type: string, objectId: string) => ({
            id: objectId,
            type,
            attributes: {
              ..._.omit(task, 'id'),
              ..._.mapValues(_.pick(task, ['params', 'state']), (value) => JSON.stringify(value)),
            },
            references: [],
            version: '123',
          }));

          const store = new TaskStore({
            logger: mockLogger(),
            index: 'tasky',
            taskManagerId: '',
            serializer,
            esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
            definitions: taskDefinitions,
            savedObjectsRepository: savedObjectsClient,
            adHocTaskCounter,
            allowReadingInvalidState: false,
            requestTimeouts: {
              update_by_query: 1000,
            },
            savedObjectsService: coreStart.savedObjects,
            security: coreStart.security,
            getIsSecurityEnabled: () => true,
          });

          expect(await store.getLifecycle(task.id)).toEqual(status);
        })
      );
    });

    test('returns NotFound status if the task doesnt exists ', async () => {
      savedObjectsClient.get.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createGenericNotFoundError('type', 'id')
      );

      const store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });

      expect(await store.getLifecycle(randomId())).toEqual(TaskLifecycleResult.NotFound);
    });

    test('throws if an unknown error takes place ', async () => {
      savedObjectsClient.get.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createBadRequestError()
      );

      const store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });

      return expect(store.getLifecycle(randomId())).rejects.toThrow('Bad Request');
    });
  });

  describe('bulkSchedule', () => {
    let store: TaskStore;
    const logger = mockLogger();

    beforeEach(() => {
      store = new TaskStore({
        logger,
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        canEncryptSavedObjects: true,
        getIsSecurityEnabled: () => true,
      });

      store.registerEncryptedSavedObjectsClient(esoClient);
    });

    afterEach(() => {
      adHocTaskCounter.reset();
      jest.resetAllMocks();
    });

    async function testBulkSchedule(task: unknown) {
      savedObjectsClient.bulkCreate.mockImplementation(async () => ({
        saved_objects: [
          {
            id: 'testid',
            type: 'test',
            attributes: {
              attempts: 0,
              params: '{"hello":"world"}',
              retryAt: null,
              runAt: '2019-02-12T21:01:22.479Z',
              scheduledAt: '2019-02-12T21:01:22.479Z',
              startedAt: null,
              state: '{"foo":"bar"}',
              stateVersion: 1,
              status: 'idle',
              taskType: 'report',
              traceparent: 'apmTraceparent',
              partition: 225,
            },
            references: [],
            version: '123',
          },
        ],
      }));
      const result = await store.bulkSchedule(task as TaskInstance[]);

      expect(savedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);

      return result;
    }

    test('serializes the params and state', async () => {
      const task = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        traceparent: 'apmTraceparent',
      };
      const result = await testBulkSchedule([task]);

      expect(savedObjectsClient.bulkCreate).toHaveBeenCalledWith(
        [
          {
            id: 'id',
            type: 'task',
            attributes: {
              attempts: 0,
              params: '{"hello":"world"}',
              retryAt: null,
              runAt: '2019-02-12T21:01:22.479Z',
              scheduledAt: '2019-02-12T21:01:22.479Z',
              startedAt: null,
              state: '{"foo":"bar"}',
              status: 'idle',
              taskType: 'report',
              traceparent: 'apmTraceparent',
              partition: 225,
            },
          },
        ],
        { refresh: false }
      );

      expect(result).toEqual([
        {
          id: 'testid',
          attempts: 0,
          schedule: undefined,
          params: { hello: 'world' },
          retryAt: null,
          runAt: mockedDate,
          scheduledAt: mockedDate,
          scope: undefined,
          startedAt: null,
          state: { foo: 'bar' },
          stateVersion: 1,
          status: 'idle',
          taskType: 'report',
          user: undefined,
          version: '123',
          traceparent: 'apmTraceparent',
          partition: 225,
        },
      ]);
    });

    test('returns a concrete task instance', async () => {
      const task = {
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
      };
      const result = await testBulkSchedule([task]);

      expect(result).toMatchObject([
        {
          ...task,
          id: 'testid',
        },
      ]);
    });

    test('bulk schedules tasks with API key if request is provided', async () => {
      const task1 = {
        id: 'task1',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
      };

      const task2 = {
        id: 'task2',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
      };

      const mockApiKey = Buffer.from('apiKeyId:apiKey').toString('base64');

      const mockUserScope = {
        apiKeyId: 'apiKeyId',
        apiKeyCreatedBy: 'testUser',
        spaceId: 'testSpace',
      };

      const request = httpServerMock.createKibanaRequest();
      const apiKeyAndUserScopeMap = new Map();
      apiKeyAndUserScopeMap.set('task1', {
        apiKey: mockApiKey,
        userScope: mockUserScope,
      });
      apiKeyAndUserScopeMap.set('task2', {
        apiKey: mockApiKey,
        userScope: mockUserScope,
      });
      (getApiKeyAndUserScope as jest.Mock).mockResolvedValueOnce(apiKeyAndUserScopeMap);

      coreStart.savedObjects.getScopedClient.mockReturnValueOnce(scopedSavedObjectsClient);

      scopedSavedObjectsClient.bulkCreate.mockImplementationOnce(async () => ({
        saved_objects: [
          {
            id: 'task1',
            type: 'test',
            attributes: {
              attempts: 0,
              params: '{"hello":"world"}',
              retryAt: null,
              runAt: '2019-02-12T21:01:22.479Z',
              scheduledAt: '2019-02-12T21:01:22.479Z',
              startedAt: null,
              state: '{"foo":"bar"}',
              stateVersion: 1,
              status: 'idle',
              taskType: 'report',
              traceparent: 'apmTraceparent',
              partition: 225,
              apiKey: mockApiKey,
              userScope: mockUserScope,
            },
            references: [],
            version: '123',
          },
          {
            id: 'task2',
            type: 'test',
            attributes: {
              attempts: 0,
              params: '{"hello":"world"}',
              retryAt: null,
              runAt: '2019-02-12T21:01:22.479Z',
              scheduledAt: '2019-02-12T21:01:22.479Z',
              startedAt: null,
              state: '{"foo":"bar"}',
              stateVersion: 1,
              status: 'idle',
              taskType: 'report',
              traceparent: 'apmTraceparent',
              partition: 225,
              apiKey: mockApiKey,
              userScope: mockUserScope,
            },
            references: [],
            version: '123',
          },
        ],
      }));

      const result = await store.bulkSchedule([task1, task2], { request });

      expect(getApiKeyAndUserScope).toHaveBeenCalledWith(
        [task1, task2],
        request,
        coreStart.security
      );

      expect(savedObjectsClient.create).not.toHaveBeenCalled();

      expect(result).toEqual([
        {
          id: 'task1',
          attempts: 0,
          params: { hello: 'world' },
          retryAt: null,
          runAt: mockedDate,
          scheduledAt: mockedDate,
          startedAt: null,
          state: { foo: 'bar' },
          stateVersion: 1,
          status: 'idle',
          taskType: 'report',
          traceparent: 'apmTraceparent',
          partition: 225,
          apiKey: mockApiKey,
          userScope: mockUserScope,
          version: '123',
        },
        {
          id: 'task2',
          attempts: 0,
          params: { hello: 'world' },
          retryAt: null,
          runAt: mockedDate,
          scheduledAt: mockedDate,
          startedAt: null,
          state: { foo: 'bar' },
          stateVersion: 1,
          status: 'idle',
          taskType: 'report',
          traceparent: 'apmTraceparent',
          partition: 225,
          apiKey: mockApiKey,
          userScope: mockUserScope,
          version: '123',
        },
      ]);
    });

    test('errors when bulk scheduling a task with API key if unable to encrypt SO', async () => {
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        canEncryptSavedObjects: false,
        getIsSecurityEnabled: () => true,
      });

      const task1 = {
        id: 'task1',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
      };

      const request = httpServerMock.createKibanaRequest();

      await expect(store.bulkSchedule([task1 as TaskInstance], { request })).rejects.toThrow(
        'Unable to schedule task(s) with API keys because the Encrypted Saved Objects plugin has not been registered or is missing encryption key.'
      );
    });

    test('bulk schedule tasks without API key if request is provided but security disabled', async () => {
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        canEncryptSavedObjects: true,
        getIsSecurityEnabled: () => false,
      });

      store.registerEncryptedSavedObjectsClient(esoClient);

      const task1 = {
        id: 'task1',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
      };

      const task2 = {
        id: 'task2',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
      };

      const request = httpServerMock.createKibanaRequest();

      savedObjectsClient.bulkCreate.mockImplementation(async () => ({
        saved_objects: [
          {
            id: 'task1',
            type: 'test',
            attributes: {
              attempts: 0,
              params: '{"hello":"world"}',
              retryAt: null,
              runAt: '2019-02-12T21:01:22.479Z',
              scheduledAt: '2019-02-12T21:01:22.479Z',
              startedAt: null,
              state: '{"foo":"bar"}',
              stateVersion: 1,
              status: 'idle',
              taskType: 'report',
              traceparent: 'apmTraceparent',
              partition: 225,
            },
            references: [],
            version: '123',
          },
          {
            id: 'task2',
            type: 'test',
            attributes: {
              attempts: 0,
              params: '{"hello":"world"}',
              retryAt: null,
              runAt: '2019-02-12T21:01:22.479Z',
              scheduledAt: '2019-02-12T21:01:22.479Z',
              startedAt: null,
              state: '{"foo":"bar"}',
              stateVersion: 1,
              status: 'idle',
              taskType: 'report',
              traceparent: 'apmTraceparent',
              partition: 225,
            },
            references: [],
            version: '123',
          },
        ],
      }));

      const result = await store.bulkSchedule([task1, task2], { request });

      expect(result).toEqual([
        {
          id: 'task1',
          attempts: 0,
          params: { hello: 'world' },
          retryAt: null,
          runAt: mockedDate,
          scheduledAt: mockedDate,
          startedAt: null,
          state: { foo: 'bar' },
          stateVersion: 1,
          status: 'idle',
          taskType: 'report',
          traceparent: 'apmTraceparent',
          partition: 225,
          version: '123',
        },
        {
          id: 'task2',
          attempts: 0,
          params: { hello: 'world' },
          retryAt: null,
          runAt: mockedDate,
          scheduledAt: mockedDate,
          startedAt: null,
          state: { foo: 'bar' },
          stateVersion: 1,
          status: 'idle',
          taskType: 'report',
          traceparent: 'apmTraceparent',
          partition: 225,
          version: '123',
        },
      ]);
    });

    test('errors if API key could not be created', async () => {
      const task = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        traceparent: 'apmTraceparent',
      };

      (getApiKeyAndUserScope as jest.Mock).mockRejectedValueOnce(
        new Error('Something went wrong!')
      );

      const request = httpServerMock.createKibanaRequest();

      await expect(store.bulkSchedule([task as TaskInstance], { request })).rejects.toThrow(
        'Something went wrong!'
      );

      expect(getApiKeyAndUserScope).toHaveBeenCalled();
    });

    test('errors if the task type is unknown', async () => {
      await expect(testBulkSchedule([{ taskType: 'nope', params: {}, state: {} }])).rejects.toThrow(
        /Unsupported task type "nope"/i
      );
    });

    test('pushes error from saved objects client to errors$', async () => {
      const task: TaskInstance = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
      };

      const firstErrorPromise = store.errors$.pipe(first()).toPromise();
      savedObjectsClient.bulkCreate.mockRejectedValue(new Error('Failure'));
      await expect(store.bulkSchedule([task])).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failure"`
      );
      expect(await firstErrorPromise).toMatchInlineSnapshot(`[Error: Failure]`);
    });

    test('increments adHocTaskCounter', async () => {
      const task: TaskInstance = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
      };

      const result = await testBulkSchedule([task]);
      expect(adHocTaskCounter.count).toEqual(result.length);
    });

    test('does not increment adHocTaskCounter if the task is recurring', async () => {
      const task: TaskInstance = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        schedule: { interval: '1m' },
      };

      await testBulkSchedule([task]);
      expect(adHocTaskCounter.count).toEqual(0);
    });

    test('skips the update with invalid interval', async () => {
      mockGetValidatedTaskInstanceFromReading.mockRestore();
      mockGetValidatedTaskInstanceForUpdating.mockRestore();

      const task1 = {
        id: 'id1',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        traceparent: 'apmTraceparent',
      };

      const task2 = {
        id: 'id2',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        traceparent: 'apmTraceparent',
        schedule: { interval: 'invalid' }, // Invalid interval
      };
      await testBulkSchedule([task1, task2]);

      expect(logger.error).toHaveBeenCalledWith(
        '[TaskStore] An error occured. Task id2 will not be updated. Error: [TaskValidator] Invalid interval "invalid". Interval must be of the form "{number}{cadence}" where number is an integer. Example: 5m.'
      );

      expect(savedObjectsClient.bulkCreate).toHaveBeenCalledWith(
        [
          {
            id: 'id1',
            type: 'task',
            attributes: {
              attempts: 0,
              params: '{"hello":"world"}',
              retryAt: null,
              runAt: '2019-02-12T21:01:22.479Z',
              scheduledAt: '2019-02-12T21:01:22.479Z',
              startedAt: null,
              state: '{"foo":"bar"}',
              status: 'idle',
              taskType: 'report',
              traceparent: 'apmTraceparent',
              partition: 49,
              stateVersion: 1,
            },
          },
        ],
        { refresh: false }
      );
    });
  });

  describe('TaskValidator', () => {
    test(`should pass allowReadingInvalidState:false accordingly`, async () => {
      const logger = mockLogger();
      mockGetValidatedTaskInstanceFromReading.mockRestore();
      mockGetValidatedTaskInstanceForUpdating.mockRestore();

      const task = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        traceparent: 'apmTraceparent',
      };

      const store = new TaskStore({
        logger,
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });

      savedObjectsClient.create.mockImplementation(async (type: string, attributes: unknown) => ({
        id: 'id',
        type,
        attributes: {
          taskType: 'report',
          traceparent: 'apmTraceparent',
          state: JSON.stringify({
            foo: 1, // Invalid state
          }),
        },
        references: [],
        version: '123',
      }));

      // allowReadingInvalidState: false, should throw an error
      await expect(store.schedule(task as TaskInstance)).rejects.toThrowError(
        `[TaskValidator] failed to migrate to version 1 because the data returned from the up migration doesn't match the schema: [foo]: expected value of type [string] but got [number]`
      );
    });

    test(`should pass allowReadingInvalidState:true accordingly`, async () => {
      const logger = mockLogger();
      mockGetValidatedTaskInstanceFromReading.mockRestore();
      mockGetValidatedTaskInstanceForUpdating.mockRestore();

      const task = {
        id: 'id',
        params: { hello: 'world' },
        state: { foo: 'bar' },
        taskType: 'report',
        traceparent: 'apmTraceparent',
      };

      const store = new TaskStore({
        logger,
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: true,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });

      savedObjectsClient.create.mockImplementation(async (type: string, attributes: unknown) => ({
        id: 'id',
        type,
        attributes: {
          taskType: 'report',
          traceparent: 'apmTraceparent',
          state: JSON.stringify({
            foo: 1, // Invalid state
          }),
        },
        references: [],
        version: '123',
      }));

      // allowReadingInvalidState: true, should not throw but log a debug message
      await store.schedule(task as TaskInstance);

      expect(logger.debug).toHaveBeenCalledWith(
        "[report][id] Failed to validate the task's state. Allowing read operation to proceed because allow_reading_invalid_state is true. Error: [TaskValidator] failed to migrate to version 1 because the data returned from the up migration doesn't match the schema: [foo]: expected value of type [string] but got [number]"
      );
    });
  });

  describe('updateByQuery', () => {
    let store: TaskStore;
    let esClient: ReturnType<typeof elasticsearchServiceMock.createClusterClient>['asInternalUser'];
    let childEsClient: ReturnType<
      typeof elasticsearchServiceMock.createClusterClient
    >['asInternalUser'];

    beforeAll(() => {
      esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      childEsClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      esClient.child.mockReturnValue(childEsClient as unknown as Client);
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });
    });
    test('should pass requestTimeout', async () => {
      childEsClient.updateByQuery.mockResponse({
        hits: { hits: [], total: 0, updated: 100, version_conflicts: 0 },
      } as UpdateByQueryResponse);
      await store.updateByQuery({ script: { source: '' } }, { max_docs: 10 });
      expect(childEsClient.updateByQuery).toHaveBeenCalledWith(expect.any(Object), {
        requestTimeout: 1000,
      });
    });
  });

  describe('bulkGetVersions', () => {
    let store: TaskStore;
    let esClient: ReturnType<typeof elasticsearchServiceMock.createClusterClient>['asInternalUser'];
    let childEsClient: ReturnType<
      typeof elasticsearchServiceMock.createClusterClient
    >['asInternalUser'];

    beforeAll(() => {
      esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      childEsClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      esClient.child.mockReturnValue(childEsClient as unknown as Client);
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });
    });

    test('should return the version of the tasks when found', async () => {
      childEsClient.mget.mockResponse({
        docs: [
          {
            _index: 'ignored-1',
            _id: 'task:some-task-a',
            _version: 424242,
            _seq_no: 123,
            _primary_term: 1,
            found: true,
          },
          {
            _index: 'ignored-2',
            _id: 'task:some-task-b',
            _version: 31415,
            _seq_no: 456,
            _primary_term: 2,
            found: true,
          },
        ],
      });

      const result = await store.bulkGetVersions(['task:some-task-a', 'task:some-task-b']);
      expect(result).toMatchInlineSnapshot(`
        Array [
          Object {
            "esId": "task:some-task-a",
            "primaryTerm": 1,
            "seqNo": 123,
          },
          Object {
            "esId": "task:some-task-b",
            "primaryTerm": 2,
            "seqNo": 456,
          },
        ]
      `);
    });

    test('should handle errors and missing tasks', async () => {
      childEsClient.mget.mockResponse({
        docs: [
          {
            _index: 'ignored-1',
            _id: 'task:some-task-a',
            _version: 424242,
            _seq_no: 123,
            _primary_term: 1,
            found: true,
          },
          {
            _index: 'ignored-2',
            _id: 'task:some-task-b',
            found: false,
          },
          {
            _index: 'ignored-3',
            _id: 'task:some-task-c',
            error: {
              type: 'index_not_found_exception',
              reason: 'no such index "ignored-4"',
            },
          },
        ],
      });

      const result = await store.bulkGetVersions([
        'task:some-task-a',
        'task:some-task-b',
        'task:some-task-c',
      ]);
      expect(result).toMatchInlineSnapshot(`
        Array [
          Object {
            "esId": "task:some-task-a",
            "primaryTerm": 1,
            "seqNo": 123,
          },
          Object {
            "error": "task \\"task:some-task-b\\" not found",
            "esId": "task:some-task-b",
          },
          Object {
            "error": "error getting version for task:some-task-c: index_not_found_exception: no such index \\"ignored-4\\"",
            "esId": "task:some-task-c",
          },
        ]
      `);
    });
  });

  describe('getDocVersions', () => {
    let store: TaskStore;
    let esClient: ReturnType<typeof elasticsearchServiceMock.createClusterClient>['asInternalUser'];
    let childEsClient: ReturnType<
      typeof elasticsearchServiceMock.createClusterClient
    >['asInternalUser'];

    beforeAll(() => {
      esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      childEsClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      esClient.child.mockReturnValue(childEsClient as unknown as Client);
      store = new TaskStore({
        logger: mockLogger(),
        index: 'tasky',
        taskManagerId: '',
        serializer,
        esClient,
        definitions: taskDefinitions,
        savedObjectsRepository: savedObjectsClient,
        adHocTaskCounter,
        allowReadingInvalidState: false,
        requestTimeouts: {
          update_by_query: 1000,
        },
        savedObjectsService: coreStart.savedObjects,
        security: coreStart.security,
        getIsSecurityEnabled: () => true,
      });
    });

    test('should return the version as expected, with errors included', async () => {
      childEsClient.mget.mockResponse({
        docs: [
          {
            _index: 'ignored-1',
            _id: 'task:some-task-a',
            _version: 424242,
            _seq_no: 123,
            _primary_term: 1,
            found: true,
          },
          {
            _index: 'ignored-2',
            _id: 'task:some-task-b',
            found: false,
          },
          {
            _index: 'ignored-3',
            _id: 'task:some-task-c',
            error: {
              type: 'index_not_found_exception',
              reason: 'no such index "ignored-4"',
            },
          },
        ],
      });

      const result = await store.getDocVersions([
        'task:some-task-a',
        'task:some-task-b',
        'task:some-task-c',
      ]);
      expect(result).toMatchInlineSnapshot(`
        Map {
          "task:some-task-a" => Object {
            "esId": "task:some-task-a",
            "primaryTerm": 1,
            "seqNo": 123,
          },
          "task:some-task-b" => Object {
            "error": "task \\"task:some-task-b\\" not found",
            "esId": "task:some-task-b",
          },
          "task:some-task-c" => Object {
            "error": "error getting version for task:some-task-c: index_not_found_exception: no such index \\"ignored-4\\"",
            "esId": "task:some-task-c",
          },
        }
      `);
    });
  });
});
