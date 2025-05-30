/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getScheduleNotificationResponseActionsService } from './schedule_notification_response_actions';
import type { RuleResponseAction } from '../../../../common/api/detection_engine';
import { ResponseActionTypesEnum } from '../../../../common/api/detection_engine';
import { ALERT_RULE_NAME, ALERT_RULE_UUID, SPACE_IDS } from '@kbn/rule-data-utils';
import { createMockEndpointAppContextService } from '../../../endpoint/mocks';
import { responseActionsClientMock } from '../../../endpoint/services/actions/clients/mocks';
import { DEFAULT_SPACE_ID } from '@kbn/spaces-plugin/common';

describe('ScheduleNotificationResponseActions', () => {
  const getSignals = () => [
    {
      agent: { id: 'agent-id-1', type: 'endpoint' },
      _id: 'alert-id-1',
      user: { id: 'S-1-5-20' },
      process: {
        pid: 123,
      },
      [ALERT_RULE_UUID]: 'rule-id-1',
      [ALERT_RULE_NAME]: 'rule-name-1',
      [SPACE_IDS]: [DEFAULT_SPACE_ID],
    },
    { agent: { id: 'agent-id-2', type: 'endpoint' }, _id: 'alert-id-2' },
  ];

  const osqueryActionMock = {
    create: jest.fn(),
    stop: jest.fn(),
  };
  let mockedResponseActionsClient = responseActionsClientMock.create();
  const endpointServiceMock = createMockEndpointAppContextService();
  (endpointServiceMock.getInternalResponseActionsClient as jest.Mock).mockImplementation(() => {
    return mockedResponseActionsClient;
  });
  // @ts-expect-error assignment to readonly property
  endpointServiceMock.experimentalFeatures.automatedProcessActionsEnabled = true;

  const scheduleNotificationResponseActions = getScheduleNotificationResponseActionsService({
    osqueryCreateActionService: osqueryActionMock,
    endpointAppContextService: endpointServiceMock,
  });

  describe('Osquery', () => {
    const simpleQuery = 'select * from uptime';
    const defaultQueryParams = {
      ecsMapping: { testField: { field: 'testField', value: 'testValue' } },
      savedQueryId: 'testSavedQueryId',
      query: undefined,
      queries: [],
      packId: undefined,
    };
    const defaultPackParams = {
      packId: 'testPackId',
      queries: [],
      query: undefined,
      ecsMapping: { testField: { field: 'testField', value: 'testValue' } },
      savedQueryId: undefined,
    };
    const defaultQueries = {
      ecs_mapping: undefined,
      platform: 'windows',
      version: '1.0.0',
      snapshot: true,
      removed: false,
    };

    const defaultResultParams = {
      agent_ids: ['agent-id-1', 'agent-id-2'],
      alert_ids: ['alert-id-1', 'alert-id-2'],
    };
    const defaultQueryResultParams = {
      ...defaultResultParams,
      ecs_mapping: { testField: { field: 'testField', value: 'testValue' } },
      ecsMapping: undefined,
      saved_query_id: 'testSavedQueryId',
      savedQueryId: undefined,
      queries: [],
    };
    const defaultPackResultParams = {
      ...defaultResultParams,
      query: undefined,
      saved_query_id: undefined,
      ecs_mapping: { testField: { field: 'testField', value: 'testValue' } },
    };
    it('should handle osquery response actions with query', async () => {
      const signals = getSignals();
      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.osquery'],
          params: {
            ...defaultQueryParams,
            query: simpleQuery,
          },
        },
      ];
      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions,
      });

      expect(response).not.toBeUndefined();
      expect(osqueryActionMock.create).toHaveBeenCalledWith({
        ...defaultQueryResultParams,
        query: simpleQuery,
      });
    });

    it('should handle osquery response actions with packs', async () => {
      const signals = getSignals();

      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.osquery'],
          params: {
            ...defaultPackParams,
            queries: [
              {
                ...defaultQueries,
                id: 'query-1',
                query: simpleQuery,
              },
            ],
            packId: 'testPackId',
          },
        },
      ];
      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions,
      });

      expect(response).not.toBeUndefined();
      expect(osqueryActionMock.create).toHaveBeenCalledWith({
        ...defaultPackResultParams,
        queries: [{ ...defaultQueries, id: 'query-1', query: simpleQuery }],
      });
    });
  });
  describe('Endpoint', () => {
    beforeEach(() => {
      (endpointServiceMock.getInternalResponseActionsClient as jest.Mock).mockClear();
      mockedResponseActionsClient = responseActionsClientMock.create();
    });

    it('should handle endpoint isolate actions', async () => {
      const signals = getSignals();

      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.endpoint'],
          params: {
            command: 'isolate',
            comment: 'test isolate comment',
          },
        },
      ];
      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions,
      });
      expect(response).not.toBeUndefined();
      expect(endpointServiceMock.getInternalResponseActionsClient).toHaveBeenCalledTimes(1);
      expect(endpointServiceMock.getInternalResponseActionsClient).toHaveBeenCalledWith({
        agentType: 'endpoint',
        username: 'unknown',
        spaceId: 'default',
      });
      expect(mockedResponseActionsClient.isolate).toHaveBeenCalledTimes(signals.length);
      expect(mockedResponseActionsClient.isolate).toHaveBeenNthCalledWith(
        1,
        {
          alert_ids: ['alert-id-1'],
          comment: 'test isolate comment',
          endpoint_ids: ['agent-id-1'],
          parameters: undefined,
        },
        {
          error: undefined,
          hosts: { 'agent-id-1': { id: 'agent-id-1', name: '' } },
          ruleId: 'rule-id-1',
          ruleName: 'rule-name-1',
        }
      );
    });
    it('should handle endpoint kill-process actions', async () => {
      const signals = getSignals();
      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.endpoint'],
          params: {
            command: 'kill-process',
            comment: 'test process comment',
            config: {
              overwrite: true,
              field: '',
            },
          },
        },
      ];
      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions,
      });

      expect(response).not.toBeUndefined();

      expect(mockedResponseActionsClient.killProcess).toHaveBeenCalledWith(
        {
          alert_ids: ['alert-id-1'],
          comment: 'test process comment',
          endpoint_ids: ['agent-id-1'],
          parameters: {
            pid: 123,
          },
        },
        {
          error: undefined,
          hosts: { 'agent-id-1': { id: 'agent-id-1', name: undefined } },
          ruleId: 'rule-id-1',
          ruleName: 'rule-name-1',
        }
      );
    });

    it('should only attempt to send response actions to alerts from endpoint', async () => {
      const signals = getSignals();
      signals.push({ agent: { id: '123-432', type: 'filebeat' }, _id: '1' });
      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.endpoint'],
          params: {
            command: 'isolate',
            comment: 'test process comment',
          },
        },
      ];
      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: signals.length,
        responseActions,
      });

      expect(response).not.toBeUndefined();
      expect(mockedResponseActionsClient.isolate).toHaveBeenCalledTimes(signals.length - 1);
    });
    it('should not call any action service if no response actions are provided', async () => {
      const response = await scheduleNotificationResponseActions({
        signals: getSignals(),
        signalsCount: 2,
        responseActions: [],
      });
      expect(response).toBeUndefined();
    });
    it('should  not call any action service if signalsCount is 0', async () => {
      const signals = getSignals();
      const responseActions: RuleResponseAction[] = [
        {
          actionTypeId: ResponseActionTypesEnum['.endpoint'],
          params: {
            command: 'isolate',
            comment: 'test process comment',
          },
        },
      ];

      const response = await scheduleNotificationResponseActions({
        signals,
        signalsCount: 0,
        responseActions,
      });

      expect(response).toBeUndefined();
    });

    it('should use default space id when space awareness is disabled', async () => {
      await scheduleNotificationResponseActions({
        signals: getSignals(),
        signalsCount: 2,
        responseActions: [
          {
            actionTypeId: ResponseActionTypesEnum['.endpoint'],
            params: {
              command: 'isolate',
              comment: 'test process comment',
            },
          },
        ],
      });

      expect(endpointServiceMock.getInternalResponseActionsClient).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: DEFAULT_SPACE_ID })
      );
    });

    describe('and when space awareness is enabled', () => {
      beforeEach(() => {
        // @ts-expect-error
        endpointServiceMock.experimentalFeatures.endpointManagementSpaceAwarenessEnabled = true;
      });

      it('should initialize a response action client with the alert space id when space awareness is enabled', async () => {
        const signals = getSignals();
        signals[0][SPACE_IDS] = ['foo'];
        await scheduleNotificationResponseActions({
          signals,
          signalsCount: 2,
          responseActions: [
            {
              actionTypeId: ResponseActionTypesEnum['.endpoint'],
              params: {
                command: 'isolate',
                comment: 'test process comment',
              },
            },
          ],
        });

        expect(endpointServiceMock.getInternalResponseActionsClient).toHaveBeenCalledWith(
          expect.objectContaining({ spaceId: 'foo' })
        );
      });

      it('should log error if unable to determine space id for alerts', async () => {
        const signals = getSignals();
        signals[0][SPACE_IDS] = undefined;
        await scheduleNotificationResponseActions({
          signals,
          signalsCount: 2,
          responseActions: [
            {
              actionTypeId: ResponseActionTypesEnum['.endpoint'],
              params: {
                command: 'isolate',
                comment: 'test process comment',
              },
            },
          ],
        });

        expect(endpointServiceMock.createLogger().error).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              "Unable to identify the space ID from alert data ('kibana.space_ids') for rule [rule-name-1][rule-id-1]",
          })
        );
        expect(endpointServiceMock.getInternalResponseActionsClient).not.toHaveBeenCalled();
      });
    });
  });
});
